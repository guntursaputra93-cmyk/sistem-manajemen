import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { companyModules } from "@/drizzle/schema";

/**
 * Baca terminology_config (jsonb, sudah ada sejak Fase 0 tapi belum pernah dipakai)
 * milik 1 company+module, timpa default per-key kalau company itu sudah mengisi
 * labelnya sendiri (mis. company A pakai "Auditor"/"Siklus Audit", company B pakai
 * "Trainer"/"Sesi Pelatihan"). Modul Fase 4 Penjadwalan adalah yang pertama benar-benar
 * memakai ini — pola acuan kalau modul lain nanti butuh terminologi dinamis juga.
 *
 * Generic di `defaults` (bukan hardcode ke 1 modul tertentu) supaya dipakai ulang:
 * tiap modul cukup definisikan objek default labelnya sendiri, key yang sama dipakai
 * untuk override dari terminology_config. Key yang tidak diisi admin (atau bukan
 * string non-kosong) jatuh ke default — company yang belum pernah atur apa pun
 * (terminology_config = {}) otomatis dapat semua default tanpa error.
 */
export async function getTerminology<T extends Record<string, string>>(
  tx: typeof Db,
  params: { companyId: string; moduleKey: string; defaults: T }
): Promise<T> {
  const [row] = await tx
    .select({ terminologyConfig: companyModules.terminologyConfig })
    .from(companyModules)
    .where(and(eq(companyModules.companyId, params.companyId), eq(companyModules.moduleKey, params.moduleKey)));

  const config = (row?.terminologyConfig as Partial<Record<keyof T, unknown>>) ?? {};
  const result = { ...params.defaults };
  for (const key of Object.keys(params.defaults) as (keyof T)[]) {
    const value = config[key];
    if (typeof value === "string" && value.trim() !== "") {
      result[key] = value.trim() as T[keyof T];
    }
  }
  return result;
}
