import { and, eq, or, isNull, isNotNull, gte, lte, inArray, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { contracts, organizations, employees, employeeCompetencies, serviceAssignments } from "@/drizzle/schema";

export class ServiceAssignmentError extends Error {}

/**
 * Sumber klien untuk penugasan SELALU otomatis dari contracts (bukan pilih manual
 * dari organizations — keputusan spesifikasi Fase 4 Bagian 3). "Aktif" = belum ada
 * end_date ATAU end_date belum lewat — contracts TIDAK punya kolom status (spek
 * asumsi ada tapi ternyata tidak; contract cuma dibuat otomatis saat opportunity
 * 'won', tidak ada konsep "lost contract"), jadi filter tanggal ini pengganti yang
 * paling dekat dengan maksud spesifikasi. Dikonfirmasi sbg asumsi kerja ke Gtr.
 */
export async function getActiveContractOptions(tx: typeof Db, params: { companyId: string }) {
  return tx
    .select({
      id: contracts.id,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      organizationId: contracts.organizationId,
      organizationName: organizations.name,
      organizationIndustry: organizations.industry,
    })
    .from(contracts)
    .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
    .where(
      and(
        eq(contracts.companyId, params.companyId),
        or(isNull(contracts.endDate), gte(contracts.endDate, sql`CURRENT_DATE`))
      )
    )
    .orderBy(organizations.name);
}

/**
 * Pencocokan kompetensi vs klien SESEDERHANA text matching (case-insensitive,
 * substring 2 arah) — sesuai instruksi spesifikasi Bagian 2.1, sengaja tidak
 * pakai algoritma rumit. Cuma WARNING, tidak pernah dipakai untuk blokir assign
 * (keputusan spesifikasi Bagian 7 — JANGAN diubah jadi validasi blocking).
 */
export async function computeCompetencyWarnings(
  tx: typeof Db,
  params: { companyId: string; employeeId: string; organizationIndustry: string | null }
): Promise<string[]> {
  const activeCompetencies = await tx
    .select()
    .from(employeeCompetencies)
    .where(
      and(
        eq(employeeCompetencies.companyId, params.companyId),
        eq(employeeCompetencies.employeeId, params.employeeId),
        eq(employeeCompetencies.status, "aktif")
      )
    );

  const warnings: string[] = [];

  if (activeCompetencies.length === 0) {
    warnings.push("Karyawan ini belum punya kompetensi berstatus aktif tercatat di sistem.");
    return warnings;
  }

  const industry = params.organizationIndustry?.trim().toLowerCase() || null;
  if (industry) {
    const hasMatch = activeCompetencies.some((c) => {
      const scheme = c.sectorScheme?.trim().toLowerCase();
      if (!scheme) return false;
      return scheme.includes(industry) || industry.includes(scheme);
    });
    if (!hasMatch) {
      warnings.push(`Tidak ada kompetensi aktif dengan skema sektor yang cocok dengan industri klien ("${params.organizationIndustry}").`);
    }
  }

  return warnings;
}

/**
 * Penugasan yang overlap dengan [rangeStart, rangeEnd] (dipakai grid kalender bulanan) —
 * lintas SEMUA klien (join contracts->organizations), lintas SEMUA personil kecuali
 * difilter. SENGAJA TIDAK mengecek/menandai tumpang-tindih jadwal 1 personil yang sama —
 * itu keputusan spesifikasi Fase 4 Bagian 5 (kalender jangan pernah jadi validasi
 * konflik, cuma tampilan). visibleEmployeeIds null = tanpa filter (admin), array =
 * dibatasi ke id itu (staff/department_head, lihat getVisibleEmployeeIds).
 */
export async function getAssignmentsOverlappingRange(
  tx: typeof Db,
  params: {
    companyId: string;
    rangeStart: string;
    rangeEnd: string;
    visibleEmployeeIds: string[] | null;
    employeeIdFilter?: string | null;
    statusFilter?: string | null;
  }
) {
  const conditions = [
    eq(serviceAssignments.companyId, params.companyId),
    lte(serviceAssignments.assignmentDate, params.rangeEnd),
    or(
      and(isNull(serviceAssignments.endDate), gte(serviceAssignments.assignmentDate, params.rangeStart)),
      and(isNotNull(serviceAssignments.endDate), gte(serviceAssignments.endDate, params.rangeStart))
    ),
  ];

  if (params.visibleEmployeeIds !== null) {
    conditions.push(inArray(serviceAssignments.employeeId, params.visibleEmployeeIds.length ? params.visibleEmployeeIds : ["__none__"]));
  }
  if (params.employeeIdFilter) {
    conditions.push(eq(serviceAssignments.employeeId, params.employeeIdFilter));
  }
  if (params.statusFilter) {
    conditions.push(eq(serviceAssignments.status, params.statusFilter as (typeof serviceAssignments.status.enumValues)[number]));
  }

  return tx
    .select({
      id: serviceAssignments.id,
      assignmentDate: serviceAssignments.assignmentDate,
      endDate: serviceAssignments.endDate,
      status: serviceAssignments.status,
      employeeId: serviceAssignments.employeeId,
      employeeName: employees.fullName,
      organizationName: organizations.name,
    })
    .from(serviceAssignments)
    .innerJoin(employees, eq(employees.id, serviceAssignments.employeeId))
    .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
    .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
    .where(and(...conditions));
}
