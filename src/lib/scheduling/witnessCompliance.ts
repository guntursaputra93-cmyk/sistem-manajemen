import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import {
  serviceAssignments,
  serviceAssignmentTeam,
  witnessedAuditEvaluations,
  employeeCompetencies,
  employees,
} from "@/drizzle/schema";

// E3 — Laporan kepatuhan witnessed audit. MURNI READ-ONLY dan TANPA tabel/kolom
// baru: seluruhnya agregat dari data yang sudah ada, pola sama persis dengan
// getAnnualAuditExperience (FR-05) di experience.ts.

/**
 * - `sudah`            : minimal 1 penugasan tahun itu sudah punya witnessed audit
 * - `belum`            : punya penugasan tahun itu, tapi TIDAK satu pun ter-witness
 * - `tanpa_penugasan`  : masuk populasi tapi tidak punya penugasan sama sekali
 *
 * `tanpa_penugasan` sengaja dipisah dari `belum`: orang yang memang tidak pernah
 * turun ke lapangan tahun itu bukan temuan ketidakpatuhan — menggabungkannya ke
 * "belum" akan melaporkan pelanggaran semu ke assessor.
 */
export type WitnessComplianceStatus = "sudah" | "belum" | "tanpa_penugasan";

export type WitnessComplianceRow = {
  employeeId: string;
  employeeName: string;
  positionTitle: string | null;
  /** Penugasan tahun itu yang melibatkan orang ini (unik, tidak dobel). */
  assignmentCount: number;
  /** Bagian dari assignmentCount yang punya >= 1 witnessed audit evaluation. */
  witnessedCount: number;
  status: WitnessComplianceStatus;
};

export type WitnessComplianceSummary = {
  rows: WitnessComplianceRow[];
  totalPopulation: number;
  sudah: number;
  belum: number;
  tanpaPenugasan: number;
  /** Persen kepatuhan dari yang PUNYA penugasan saja (penyebut wajar). */
  compliancePercent: number | null;
};

/**
 * Hanya penugasan yang pekerjaannya benar-benar terjadi/berlangsung yang dihitung.
 * `dijadwalkan` (belum mulai) dan `dibatalkan` dikecualikan — witnessing hanya
 * mungkin pada pekerjaan yang sudah berjalan, jadi memasukkannya akan menciptakan
 * ketidakpatuhan semu.
 */
const COUNTED_STATUSES = ["berlangsung", "selesai"] as const;

/**
 * Populasi laporan = karyawan yang punya minimal 1 baris employee_competencies
 * (keputusan pemilik produk), BUKAN seluruh karyawan.
 *
 * Keterlibatan dinilai PER PENUGASAN, bukan per anggota tim individual: sebuah
 * penugasan dianggap "melibatkan" seseorang bila ia personil utama
 * (service_assignments.employee_id) ATAU anggota tim tambahan
 * (service_assignment_team) — pola identik dengan experience.ts. Karena seseorang
 * bisa muncul di KEDUA tempat untuk penugasan yang sama, dedup memakai Set agar
 * tidak terhitung ganda.
 */
export async function getWitnessCompliance(
  tx: typeof Db,
  params: { companyId: string; year: number }
): Promise<WitnessComplianceSummary> {
  const yearPrefix = `${params.year}-`;

  // 1. Populasi: karyawan yang punya minimal 1 kompetensi tercatat.
  const populationRows = await tx
    .selectDistinct({
      employeeId: employeeCompetencies.employeeId,
      employeeName: employees.fullName,
      positionTitle: employees.currentPositionTitle,
    })
    .from(employeeCompetencies)
    .innerJoin(employees, eq(employees.id, employeeCompetencies.employeeId))
    .where(eq(employeeCompetencies.companyId, params.companyId));

  if (populationRows.length === 0) {
    return { rows: [], totalPopulation: 0, sudah: 0, belum: 0, tanpaPenugasan: 0, compliancePercent: null };
  }

  // 2. Penugasan perusahaan ini yang pekerjaannya terjadi, lalu disaring ke tahun
  //    terpilih. Penyaringan tahun memakai prefiks string tanggal ISO — pola sama
  //    dengan experience.ts, dan aman karena assignment_date bertipe `date`
  //    (tanpa jam/zona waktu, jadi tidak ada masalah pergeseran timezone).
  const assignmentRows = await tx
    .select({
      assignmentId: serviceAssignments.id,
      employeeId: serviceAssignments.employeeId,
      assignmentDate: serviceAssignments.assignmentDate,
    })
    .from(serviceAssignments)
    .where(
      and(
        eq(serviceAssignments.companyId, params.companyId),
        inArray(serviceAssignments.status, [...COUNTED_STATUSES])
      )
    );

  const inYear = assignmentRows.filter((r) => r.assignmentDate.startsWith(yearPrefix));
  const assignmentIds = inYear.map((r) => r.assignmentId);

  // 3. Anggota tim tambahan + penugasan mana saja yang punya witnessed audit.
  const [teamRows, witnessedRows] = await Promise.all([
    assignmentIds.length
      ? tx
          .select({ assignmentId: serviceAssignmentTeam.assignmentId, employeeId: serviceAssignmentTeam.employeeId })
          .from(serviceAssignmentTeam)
          .where(inArray(serviceAssignmentTeam.assignmentId, assignmentIds))
      : Promise.resolve([] as { assignmentId: string; employeeId: string }[]),
    assignmentIds.length
      ? tx
          .selectDistinct({ assignmentId: witnessedAuditEvaluations.assignmentId })
          .from(witnessedAuditEvaluations)
          .where(
            and(
              eq(witnessedAuditEvaluations.companyId, params.companyId),
              inArray(witnessedAuditEvaluations.assignmentId, assignmentIds)
            )
          )
      : Promise.resolve([] as { assignmentId: string }[]),
  ]);

  const witnessedAssignmentIds = new Set(witnessedRows.map((r) => r.assignmentId));

  // 4. Kumpulkan penugasan unik per karyawan (Set = dedup utama vs anggota tim).
  const perEmployee = new Map<string, Set<string>>();
  const involve = (employeeId: string, assignmentId: string) => {
    let set = perEmployee.get(employeeId);
    if (!set) { set = new Set(); perEmployee.set(employeeId, set); }
    set.add(assignmentId);
  };
  for (const a of inYear) involve(a.employeeId, a.assignmentId);
  for (const t of teamRows) involve(t.employeeId, t.assignmentId);

  // 5. Susun baris laporan untuk SELURUH populasi — termasuk yang tanpa penugasan,
  //    supaya assessor melihat daftar lengkap, bukan hanya yang kebetulan bertugas.
  const rows: WitnessComplianceRow[] = populationRows.map((p) => {
    const ids = perEmployee.get(p.employeeId) ?? new Set<string>();
    const assignmentCount = ids.size;
    let witnessedCount = 0;
    for (const id of ids) if (witnessedAssignmentIds.has(id)) witnessedCount++;
    const status: WitnessComplianceStatus =
      assignmentCount === 0 ? "tanpa_penugasan" : witnessedCount > 0 ? "sudah" : "belum";
    return {
      employeeId: p.employeeId,
      employeeName: p.employeeName,
      positionTitle: p.positionTitle,
      assignmentCount,
      witnessedCount,
      status,
    };
  });

  // Yang BELUM patuh diletakkan paling atas — itu yang ditindaklanjuti.
  const order: Record<WitnessComplianceStatus, number> = { belum: 0, sudah: 1, tanpa_penugasan: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.employeeName.localeCompare(b.employeeName));

  const sudah = rows.filter((r) => r.status === "sudah").length;
  const belum = rows.filter((r) => r.status === "belum").length;
  const tanpaPenugasan = rows.filter((r) => r.status === "tanpa_penugasan").length;
  const withAssignment = sudah + belum;

  return {
    rows,
    totalPopulation: rows.length,
    sudah,
    belum,
    tanpaPenugasan,
    compliancePercent: withAssignment === 0 ? null : Math.round((sudah / withAssignment) * 1000) / 10,
  };
}

/** Daftar tahun untuk dropdown filter — tahun berjalan plus beberapa tahun ke belakang. */
export function selectableYears(currentYear: number, back = 4): number[] {
  return Array.from({ length: back + 1 }, (_, i) => currentYear - i);
}
