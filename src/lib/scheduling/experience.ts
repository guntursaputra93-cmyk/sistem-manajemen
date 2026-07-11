import { and, eq, inArray } from "drizzle-orm";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { db as Db } from "@/lib/db";
import { serviceAssignments, serviceAssignmentTeam, contracts, organizations, employees } from "@/drizzle/schema";

export type AnnualAuditExperience = {
  employeeId: string;
  employeeName: string;
  assignmentCount: number;
  totalDays: number;
  clients: string[];
  sectors: string[];
};

function assignmentDays(assignmentDate: string, endDate: string | null): number {
  if (!endDate) return 1;
  return differenceInCalendarDays(parseISO(endDate), parseISO(assignmentDate)) + 1;
}

/**
 * FR-05: rekap pengalaman audit tahunan — agregat dari service_assignments, BUKAN
 * tabel baru. Hanya hitung assignment berstatus 'selesai' (yang masih dijadwalkan/
 * berlangsung belum jadi "pengalaman" — sesuai catatan integrasi spesifikasi: hasil
 * penugasan selesai jadi sumber data pengalaman kerja historis). Dihitung ganda
 * sengaja: karyawan yang jadi personil UTAMA maupun anggota tim tambahan
 * (service_assignment_team) SAMA-SAMA dapat kredit pengalaman untuk assignment itu —
 * bukan cuma employee_id kolom utama, supaya rekap mencerminkan pengalaman nyata
 * semua orang yang terlibat di lapangan.
 */
export async function getAnnualAuditExperience(
  tx: typeof Db,
  params: { companyId: string; year: number; visibleEmployeeIds: string[] | null }
): Promise<AnnualAuditExperience[]> {
  const yearPrefix = `${params.year}-`;

  const primaryRows = await tx
    .select({
      assignmentId: serviceAssignments.id,
      employeeId: serviceAssignments.employeeId,
      employeeName: employees.fullName,
      assignmentDate: serviceAssignments.assignmentDate,
      endDate: serviceAssignments.endDate,
      organizationName: organizations.name,
      organizationIndustry: organizations.industry,
    })
    .from(serviceAssignments)
    .innerJoin(employees, eq(employees.id, serviceAssignments.employeeId))
    .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
    .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
    .where(and(eq(serviceAssignments.companyId, params.companyId), eq(serviceAssignments.status, "selesai")));

  const finishedInYear = primaryRows.filter((r) => r.assignmentDate.startsWith(yearPrefix));
  const finishedAssignmentIds = finishedInYear.map((r) => r.assignmentId);

  const teamRows = finishedAssignmentIds.length
    ? await tx
        .select({
          assignmentId: serviceAssignmentTeam.assignmentId,
          employeeId: serviceAssignmentTeam.employeeId,
          employeeName: employees.fullName,
        })
        .from(serviceAssignmentTeam)
        .innerJoin(employees, eq(employees.id, serviceAssignmentTeam.employeeId))
        .where(inArray(serviceAssignmentTeam.assignmentId, finishedAssignmentIds))
    : [];

  type Bucket = { employeeName: string; assignmentIds: Set<string>; days: number; clients: Set<string>; sectors: Set<string> };
  const buckets = new Map<string, Bucket>();

  function addToBucket(employeeId: string, employeeName: string, assignmentId: string, days: number, orgName: string, orgIndustry: string | null) {
    let bucket = buckets.get(employeeId);
    if (!bucket) {
      bucket = { employeeName, assignmentIds: new Set(), days: 0, clients: new Set(), sectors: new Set() };
      buckets.set(employeeId, bucket);
    }
    if (!bucket.assignmentIds.has(assignmentId)) {
      bucket.assignmentIds.add(assignmentId);
      bucket.days += days;
    }
    bucket.clients.add(orgName);
    if (orgIndustry) bucket.sectors.add(orgIndustry);
  }

  for (const r of finishedInYear) {
    addToBucket(r.employeeId, r.employeeName, r.assignmentId, assignmentDays(r.assignmentDate, r.endDate), r.organizationName, r.organizationIndustry);
  }
  for (const t of teamRows) {
    const source = finishedInYear.find((r) => r.assignmentId === t.assignmentId);
    if (!source) continue;
    addToBucket(t.employeeId, t.employeeName, t.assignmentId, assignmentDays(source.assignmentDate, source.endDate), source.organizationName, source.organizationIndustry);
  }

  let results: AnnualAuditExperience[] = Array.from(buckets.entries()).map(([employeeId, b]) => ({
    employeeId,
    employeeName: b.employeeName,
    assignmentCount: b.assignmentIds.size,
    totalDays: b.days,
    clients: Array.from(b.clients).sort(),
    sectors: Array.from(b.sectors).sort(),
  }));

  if (params.visibleEmployeeIds !== null) {
    results = results.filter((r) => params.visibleEmployeeIds!.includes(r.employeeId));
  }

  results.sort((a, b) => b.totalDays - a.totalDays || a.employeeName.localeCompare(b.employeeName));
  return results;
}
