import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import {
  practitionerEligibilityEvaluations,
  practitionerEligibilitySettings,
  serviceAssignments,
  serviceAssignmentTeam,
  witnessedAuditEvaluations,
  cpdSettings,
  employees,
} from "@/drizzle/schema";
import { getWitnessCompliance } from "@/lib/scheduling/witnessCompliance";
import { getCpdHoursSummaryBatch } from "@/lib/hr/cpd";
import { getApprovalStatus, initializeApprovalSteps, type ApprovalEntityType } from "@/lib/approval/flows";

// AUDIT-E1 — evaluasi kelayakan tahunan personil (SOP 5.8, digeneralisasi).
// Istilah "practitioner/personil", BUKAN "auditor" — 4 company, jenis jasa beda.

export const ELIGIBILITY_ENTITY_TYPE: ApprovalEntityType = "evaluasi_kelayakan_personil";
/** jenis_key approval_flows untuk entity ini — 1 jenis saja (evaluasi tahunan). */
export const ELIGIBILITY_JENIS_KEY = "evaluasi_tahunan";

/** Dipakai kalau company belum mengisi practitioner_eligibility_settings. */
export const DEFAULT_SENIOR_MIN_ASSIGNMENTS = 5;

export type ProposedStatus = "layak_senior" | "layak_junior" | "tidak_layak";
export type FinalStatus = "pending_review" | ProposedStatus | "ditolak";

export type EligibilityCriteria = {
  employeeId: string;
  employeeName: string;
  positionTitle: string | null;
  /** Kriteria 1 — jumlah penugasan tahun berjalan. */
  assignmentCount: number;
  /** Kriteria 2 — PERNAH di-witness kapan saja (bukan hanya tahun ini). */
  everWitnessed: boolean;
  /** Kriteria 3 — target CPD tahun berjalan terpenuhi. */
  cpdTargetMet: boolean;
  cpdTotalHours: number;
  cpdTargetHours: number | null;
  proposedStatus: ProposedStatus;
};

/**
 * GATE + TIER (spesifikasi pemilik produk):
 * - Kriteria 2 ATAU 3 gagal  -> "tidak_layak", berapa pun jumlah penugasannya.
 * - Kedua gate lolos         -> tier dari jumlah penugasan vs ambang batas.
 */
export function decideProposedStatus(params: {
  assignmentCount: number;
  everWitnessed: boolean;
  cpdTargetMet: boolean;
  seniorMinAssignments: number;
}): ProposedStatus {
  if (!params.everWitnessed || !params.cpdTargetMet) return "tidak_layak";
  return params.assignmentCount >= params.seniorMinAssignments ? "layak_senior" : "layak_junior";
}

/** Ambang batas senior milik company, jatuh ke default kalau belum diatur. */
export async function getSeniorMinAssignments(tx: typeof Db, companyId: string): Promise<number> {
  const [row] = await tx
    .select()
    .from(practitionerEligibilitySettings)
    .where(eq(practitionerEligibilitySettings.companyId, companyId));
  return row?.seniorMinAssignments ?? DEFAULT_SENIOR_MIN_ASSIGNMENTS;
}

/**
 * Kriteria 2: penugasan mana pun yang melibatkan orang ini (utama ATAU anggota
 * tim) yang punya witnessed audit — TANPA batas tahun, sesuai spesifikasi
 * "PERNAH di-witness, kapan saja sepanjang riwayat".
 */
async function getEverWitnessedEmployeeIds(tx: typeof Db, companyId: string): Promise<Set<string>> {
  const witnessed = await tx
    .selectDistinct({ assignmentId: witnessedAuditEvaluations.assignmentId })
    .from(witnessedAuditEvaluations)
    .where(eq(witnessedAuditEvaluations.companyId, companyId));
  const ids = witnessed.map((w) => w.assignmentId);
  if (ids.length === 0) return new Set();

  const [primary, team] = await Promise.all([
    tx.selectDistinct({ employeeId: serviceAssignments.employeeId })
      .from(serviceAssignments)
      .where(and(eq(serviceAssignments.companyId, companyId), inArray(serviceAssignments.id, ids))),
    tx.selectDistinct({ employeeId: serviceAssignmentTeam.employeeId })
      .from(serviceAssignmentTeam)
      .where(inArray(serviceAssignmentTeam.assignmentId, ids)),
  ]);

  return new Set([...primary.map((r) => r.employeeId), ...team.map((r) => r.employeeId)]);
}

/**
 * Hitung 3 kriteria untuk seluruh populasi. TIDAK menulis apa pun.
 *
 * Reuse penuh, tidak menulis ulang perhitungan dari nol:
 * - Kriteria 1 memakai getWitnessCompliance (AUDIT-E3) — populasinya sama persis
 *   (karyawan dengan >=1 employee_competencies) dan assignmentCount-nya sudah
 *   menggabungkan service_assignments + service_assignment_team dengan dedup.
 * - Kriteria 3 memakai getCpdHoursSummaryBatch (AUDIT-E2).
 */
export async function computeEligibility(
  tx: typeof Db,
  params: { companyId: string; year: number }
): Promise<{ rows: EligibilityCriteria[]; seniorMinAssignments: number; cpdTargetHours: number | null }> {
  const compliance = await getWitnessCompliance(tx, { companyId: params.companyId, year: params.year });
  const employeeIds = compliance.rows.map((r) => r.employeeId);

  const [everWitnessed, cpdHours, [cpdSetting], seniorMinAssignments] = await Promise.all([
    getEverWitnessedEmployeeIds(tx, params.companyId),
    getCpdHoursSummaryBatch(tx, {
      companyId: params.companyId,
      employeeIds: employeeIds.length ? employeeIds : null,
      yearFrom: params.year,
      yearTo: params.year,
    }),
    tx.select().from(cpdSettings).where(eq(cpdSettings.companyId, params.companyId)),
    getSeniorMinAssignments(tx, params.companyId),
  ]);

  const cpdTargetHours = cpdSetting?.annualTargetHours != null ? Number(cpdSetting.annualTargetHours) : null;

  const rows = compliance.rows.map((r) => {
    const cpdTotalHours = cpdHours.get(r.employeeId) ?? 0;
    // Target CPD belum diatur admin => kriteria ini TIDAK bisa diverifikasi, jadi
    // dianggap TIDAK terpenuhi (bukan otomatis lolos). Sejalan dengan sikap
    // fail-closed di modul ini: kriteria yang tak terbukti tidak boleh meloloskan.
    // UI menampilkan peringatan agar admin tahu penyebabnya dan bisa mengaturnya.
    const cpdTargetMet = cpdTargetHours !== null && cpdTotalHours >= cpdTargetHours;
    const everW = everWitnessed.has(r.employeeId);
    return {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      positionTitle: r.positionTitle,
      assignmentCount: r.assignmentCount,
      everWitnessed: everW,
      cpdTargetMet,
      cpdTotalHours,
      cpdTargetHours,
      proposedStatus: decideProposedStatus({
        assignmentCount: r.assignmentCount,
        everWitnessed: everW,
        cpdTargetMet,
        seniorMinAssignments,
      }),
    } satisfies EligibilityCriteria;
  });

  return { rows, seniorMinAssignments, cpdTargetHours };
}

/**
 * Simpan hasil perhitungan sebagai evaluasi draft (final_status tetap default
 * 'pending_review'). Idempotent per (company, employee, year): menjalankan ulang
 * memperbarui SNAPSHOT kriteria & usulan status.
 *
 * Baris yang final_status-nya sudah bukan 'pending_review' TIDAK ditimpa —
 * evaluasi yang sudah diputuskan Direktur adalah bukti kepatuhan, tidak boleh
 * berubah diam-diam karena data sumbernya bergerak.
 */
export async function generateEvaluations(
  tx: typeof Db,
  params: { companyId: string; year: number; createdBy: string }
): Promise<{ created: number; updated: number; skippedDecided: number }> {
  const { rows } = await computeEligibility(tx, { companyId: params.companyId, year: params.year });
  if (rows.length === 0) return { created: 0, updated: 0, skippedDecided: 0 };

  const existing = await tx
    .select()
    .from(practitionerEligibilityEvaluations)
    .where(
      and(
        eq(practitionerEligibilityEvaluations.companyId, params.companyId),
        eq(practitionerEligibilityEvaluations.year, params.year)
      )
    );
  const byEmployee = new Map(existing.map((e) => [e.employeeId, e]));

  let created = 0, updated = 0, skippedDecided = 0;
  for (const r of rows) {
    const prev = byEmployee.get(r.employeeId);
    if (prev && prev.finalStatus !== "pending_review") { skippedDecided++; continue; }

    const values = {
      assignmentCount: r.assignmentCount,
      everWitnessed: r.everWitnessed,
      cpdTargetMet: r.cpdTargetMet,
      proposedStatus: r.proposedStatus,
      updatedAt: new Date(),
    };

    if (prev) {
      await tx.update(practitionerEligibilityEvaluations).set(values)
        .where(eq(practitionerEligibilityEvaluations.id, prev.id));
      updated++;
    } else {
      await tx.insert(practitionerEligibilityEvaluations).values({
        companyId: params.companyId,
        employeeId: r.employeeId,
        year: params.year,
        createdBy: params.createdBy,
        ...values,
      });
      created++;
    }
  }
  return { created, updated, skippedDecided };
}

/**
 * ⚠️ FAIL-CLOSED — inti AUDIT-E1.
 *
 * Modul approval bersifat PERMISIF secara default: kalau company belum
 * mengonfigurasi approval_flows, initializeApprovalSteps() membuat 0 step dan
 * getApprovalStatus() mengembalikan allApproved = true, karena `[].every()`
 * bernilai true di JavaScript (lihat lib/approval/flows.ts baris ~150). Untuk
 * surat/dokumen itu memang disengaja.
 *
 * Untuk evaluasi kelayakan, perilaku itu BERBAHAYA: personil bisa berstatus
 * "layak" tanpa satu pun Direktur meninjaunya, hanya karena approval flow belum
 * dikonfigurasi — persis temuan yang dicari assessor. Karena itu fungsi ini
 * memeriksa `totalSteps === 0` LEBIH DULU dan mengembalikan 'pending_review',
 * sehingga ketiadaan konfigurasi menahan status, bukan meloloskannya.
 *
 * Sengaja TIDAK mengubah flows.ts: entity lain bergantung pada default permisif
 * itu, jadi pengecualian ditempatkan di sini, bukan di mesin bersama.
 */
export async function resolveFinalStatus(
  tx: typeof Db,
  params: { evaluationId: string; proposedStatus: ProposedStatus }
): Promise<FinalStatus> {
  const status = await getApprovalStatus(tx, {
    entityType: ELIGIBILITY_ENTITY_TYPE,
    entityId: params.evaluationId,
  });

  // >>> BARIS FAIL-CLOSED <<< tanpa ini, 0 step akan lolos sebagai "approved".
  if (status.totalSteps === 0) return "pending_review";

  if (status.anyRejected) return "ditolak";
  if (status.allApproved) return params.proposedStatus;
  return "pending_review";
}

/** Kirim 1 evaluasi ke jenjang approval. Kalau company belum punya konfigurasi
 * flow, 0 step terbentuk dan status TETAP 'pending_review' (fail-closed). */
export async function submitForApproval(
  tx: typeof Db,
  params: { companyId: string; evaluationId: string }
): Promise<{ stepsCreated: number }> {
  await initializeApprovalSteps(tx, {
    companyId: params.companyId,
    entityType: ELIGIBILITY_ENTITY_TYPE,
    entityId: params.evaluationId,
    jenisKey: ELIGIBILITY_JENIS_KEY,
  });
  const status = await getApprovalStatus(tx, {
    entityType: ELIGIBILITY_ENTITY_TYPE,
    entityId: params.evaluationId,
  });
  return { stepsCreated: status.totalSteps };
}

/** Hitung ulang final_status dari kondisi approval terkini lalu simpan. */
export async function syncFinalStatus(
  tx: typeof Db,
  params: { evaluationId: string }
): Promise<FinalStatus> {
  const [row] = await tx
    .select()
    .from(practitionerEligibilityEvaluations)
    .where(eq(practitionerEligibilityEvaluations.id, params.evaluationId));
  if (!row) throw new Error("Evaluasi tidak ditemukan.");

  const finalStatus = await resolveFinalStatus(tx, {
    evaluationId: row.id,
    proposedStatus: row.proposedStatus as ProposedStatus,
  });

  if (finalStatus !== row.finalStatus) {
    await tx
      .update(practitionerEligibilityEvaluations)
      .set({ finalStatus, updatedAt: new Date() })
      .where(eq(practitionerEligibilityEvaluations.id, row.id));
  }
  return finalStatus;
}

export type EvaluationListRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  positionTitle: string | null;
  assignmentCount: number;
  everWitnessed: boolean;
  cpdTargetMet: boolean;
  proposedStatus: ProposedStatus;
  finalStatus: FinalStatus;
  /** 0 = belum pernah disubmit ATAU company belum punya approval flow. */
  approvalSteps: number;
};

/** Daftar evaluasi 1 tahun, final_status-nya sudah disegarkan (fail-closed). */
export async function listEvaluations(
  tx: typeof Db,
  params: { companyId: string; year: number }
): Promise<EvaluationListRow[]> {
  const rows = await tx
    .select({
      id: practitionerEligibilityEvaluations.id,
      employeeId: practitionerEligibilityEvaluations.employeeId,
      employeeName: employees.fullName,
      positionTitle: employees.currentPositionTitle,
      assignmentCount: practitionerEligibilityEvaluations.assignmentCount,
      everWitnessed: practitionerEligibilityEvaluations.everWitnessed,
      cpdTargetMet: practitionerEligibilityEvaluations.cpdTargetMet,
      proposedStatus: practitionerEligibilityEvaluations.proposedStatus,
      finalStatus: practitionerEligibilityEvaluations.finalStatus,
    })
    .from(practitionerEligibilityEvaluations)
    .innerJoin(employees, eq(employees.id, practitionerEligibilityEvaluations.employeeId))
    .where(
      and(
        eq(practitionerEligibilityEvaluations.companyId, params.companyId),
        eq(practitionerEligibilityEvaluations.year, params.year)
      )
    );

  const result: EvaluationListRow[] = [];
  for (const r of rows) {
    const status = await getApprovalStatus(tx, {
      entityType: ELIGIBILITY_ENTITY_TYPE,
      entityId: r.id,
    });
    // Fail-closed juga saat MEMBACA, bukan hanya saat menulis — supaya baris lama
    // yang tersimpan sebelum flow dihapus tidak tampil "layak" secara keliru.
    const finalStatus: FinalStatus =
      status.totalSteps === 0
        ? "pending_review"
        : status.anyRejected
          ? "ditolak"
          : status.allApproved
            ? (r.proposedStatus as ProposedStatus)
            : "pending_review";

    result.push({
      ...r,
      proposedStatus: r.proposedStatus as ProposedStatus,
      finalStatus,
      approvalSteps: status.totalSteps,
    });
  }

  result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return result;
}
