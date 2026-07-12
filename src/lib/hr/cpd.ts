import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { cpdActivities, cpdSettings } from "@/drizzle/schema";

export type CpdHoursSummary = {
  totalHours: number;
  targetHours: number | null;
  met: boolean | null;
};

/** Total jam CPD karyawan di 1 tahun vs target tahunan perusahaan (null kalau admin belum mengatur target). */
export async function getCpdHoursSummary(tx: typeof Db, params: { companyId: string; employeeId: string; year: number }): Promise<CpdHoursSummary> {
  const [activities, [settings]] = await Promise.all([
    tx.select().from(cpdActivities).where(and(eq(cpdActivities.employeeId, params.employeeId), eq(cpdActivities.year, params.year))),
    tx.select().from(cpdSettings).where(eq(cpdSettings.companyId, params.companyId)),
  ]);

  const totalHours = activities.reduce((sum, a) => sum + Number(a.durationHours), 0);
  const targetHours = settings?.annualTargetHours != null ? Number(settings.annualTargetHours) : null;

  return { totalHours, targetHours, met: targetHours != null ? totalHours >= targetHours : null };
}

/**
 * Rekap jam CPD per karyawan untuk rentang tahun — 1 query ter-agregasi
 * (GROUP BY employee_id), BUKAN loop per karyawan, supaya rekap tetap efisien
 * berapa pun jumlah karyawannya. Dipakai halaman rekap admin (filter karyawan +
 * rentang tahun), beda dari getCpdHoursSummary di atas yang untuk 1
 * karyawan/1 tahun saja (halaman "CPD Saya").
 */
export async function getCpdHoursSummaryBatch(
  tx: typeof Db,
  params: { companyId: string; employeeIds: string[] | null; yearFrom: number; yearTo: number }
): Promise<Map<string, number>> {
  const conditions = [
    eq(cpdActivities.companyId, params.companyId),
    gte(cpdActivities.year, params.yearFrom),
    lte(cpdActivities.year, params.yearTo),
  ];
  if (params.employeeIds !== null) {
    if (params.employeeIds.length === 0) return new Map();
    conditions.push(inArray(cpdActivities.employeeId, params.employeeIds));
  }

  const rows = await tx
    .select({
      employeeId: cpdActivities.employeeId,
      totalHours: sql<string>`sum(${cpdActivities.durationHours})`,
    })
    .from(cpdActivities)
    .where(and(...conditions))
    .groupBy(cpdActivities.employeeId);

  return new Map(rows.map((r) => [r.employeeId, Number(r.totalHours)]));
}
