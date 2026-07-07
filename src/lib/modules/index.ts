import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { db as Db } from "@/lib/db";
import { companyModules } from "@/drizzle/schema";

// 2 module_key Fase 1 (spesifikasi Bagian 1) + crm (modul tambahan CRM Bagian 1) — toggle independen per perusahaan.
export const MODULE_KEYS = ["surat_masuk_keluar", "pengendalian_dokumen", "crm"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  surat_masuk_keluar: "Surat Masuk/Keluar & Nota Dinas",
  pengendalian_dokumen: "Pengendalian Dokumen",
  crm: "CRM (Manajemen Klien & Pipeline Penjualan)",
};

/** Default FALSE kalau belum ada baris sama sekali — modul harus diaktifkan eksplisit. */
export async function isModuleEnabled(tx: typeof Db, params: { companyId: string; moduleKey: ModuleKey }): Promise<boolean> {
  const [row] = await tx
    .select()
    .from(companyModules)
    .where(and(eq(companyModules.companyId, params.companyId), eq(companyModules.moduleKey, params.moduleKey)));
  return row?.isEnabled ?? false;
}

/** Pertahanan berlapis di level halaman — nav link sudah disembunyikan di layout,
 * ini menjaga kalau ada yang buka URL langsung sementara modulnya nonaktif. */
export async function requireModuleEnabled(
  tx: typeof Db,
  params: { companyId: string; moduleKey: ModuleKey; companySlug: string }
): Promise<void> {
  const enabled = await isModuleEnabled(tx, { companyId: params.companyId, moduleKey: params.moduleKey });
  if (!enabled) {
    redirect(`/${params.companySlug}/dashboard`);
  }
}
