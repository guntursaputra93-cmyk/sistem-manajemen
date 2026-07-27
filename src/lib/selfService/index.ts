import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withTenantContext, type db as Db } from "@/lib/db";
import { userSelfServiceAccess } from "@/drizzle/schema";

// Fitur self-service yang bisa dibatasi PER KARYAWAN (beda dari company_modules
// yang toggle kolektif per perusahaan, dan beda dari rbac/permissions.ts yang
// generik per role) — tambahkan key baru di sini saat fitur self-service baru
// dibangun (mis. reimburse), tidak perlu migrasi baru.
export const SELF_SERVICE_FEATURE_KEYS = ["gaji_saya", "kasbon"] as const;
export type SelfServiceFeatureKey = (typeof SELF_SERVICE_FEATURE_KEYS)[number];

export const SELF_SERVICE_FEATURE_LABEL: Record<SelfServiceFeatureKey, string> = {
  gaji_saya: "Gaji Saya (slip gaji)",
  kasbon: "Kasbon",
};

/** Default TERBUKA kalau baris belum ada — beda dari isModuleEnabled (default
 * tertutup) supaya user yang sudah ada tidak mendadak kehilangan akses begitu
 * migrasi ini jalan; restriksi baru berlaku kalau admin eksplisit mematikan. */
export async function isSelfServiceFeatureEnabled(
  tx: typeof Db,
  params: { userId: string; featureKey: SelfServiceFeatureKey }
): Promise<boolean> {
  const [row] = await tx
    .select()
    .from(userSelfServiceAccess)
    .where(and(eq(userSelfServiceAccess.userId, params.userId), eq(userSelfServiceAccess.featureKey, params.featureKey)));
  return row?.isEnabled ?? true;
}

/** Ambil semua flag self-service milik 1 user sebagai map — dipakai layout.tsx
 * supaya cukup 1 query per page load (bukan 1 query per fitur). Key yang belum
 * punya baris otomatis dianggap true (lihat isSelfServiceFeatureEnabled). */
export async function getSelfServiceFlags(
  tx: typeof Db,
  params: { userId: string }
): Promise<Record<SelfServiceFeatureKey, boolean>> {
  const rows = await tx
    .select()
    .from(userSelfServiceAccess)
    .where(eq(userSelfServiceAccess.userId, params.userId));

  const flags = {} as Record<SelfServiceFeatureKey, boolean>;
  for (const key of SELF_SERVICE_FEATURE_KEYS) {
    const row = rows.find((r) => r.featureKey === key);
    flags[key] = row?.isEnabled ?? true;
  }
  return flags;
}

/** Pertahanan berlapis di level halaman — nav link sudah disembunyikan di layout
 * (pola sama seperti requireModuleEnabled), ini menjaga kalau ada yang buka URL
 * langsung sementara fitur self-service-nya dimatikan admin. */
export async function requireSelfServiceFeatureEnabled(
  tx: typeof Db,
  params: { userId: string; featureKey: SelfServiceFeatureKey; companySlug: string }
): Promise<void> {
  const enabled = await isSelfServiceFeatureEnabled(tx, { userId: params.userId, featureKey: params.featureKey });
  if (!enabled) {
    redirect(`/${params.companySlug}/dashboard`);
  }
}

/** Guard untuk SERVER ACTION (pola sama requireModuleEnabledForAction) — companyId
 * diambil dari SESSION supaya app.current_company_id konsisten dengan RLS. */
export async function requireSelfServiceFeatureEnabledForAction(params: {
  role: string;
  companyId: string | null;
  userId: string;
  companySlug: string;
  featureKey: SelfServiceFeatureKey;
}): Promise<void> {
  if (!params.companyId) redirect(`/${params.companySlug}/dashboard`);
  await withTenantContext({ role: params.role, companyId: params.companyId, userId: params.userId }, (tx) =>
    requireSelfServiceFeatureEnabled(tx, { userId: params.userId, featureKey: params.featureKey, companySlug: params.companySlug })
  );
}

/** Set (upsert) 1 flag self-service untuk 1 user — dipakai dari form edit user. */
export async function setSelfServiceFlag(
  tx: typeof Db,
  params: { companyId: string; userId: string; featureKey: SelfServiceFeatureKey; isEnabled: boolean }
): Promise<void> {
  await tx
    .insert(userSelfServiceAccess)
    .values({
      companyId: params.companyId,
      userId: params.userId,
      featureKey: params.featureKey,
      isEnabled: params.isEnabled,
    })
    .onConflictDoUpdate({
      target: [userSelfServiceAccess.userId, userSelfServiceAccess.featureKey],
      set: { isEnabled: params.isEnabled, updatedAt: new Date() },
    });
}
