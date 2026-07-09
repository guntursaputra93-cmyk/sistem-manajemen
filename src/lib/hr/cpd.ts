import { and, eq } from "drizzle-orm";
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
