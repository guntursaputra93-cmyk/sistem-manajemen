"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { createFixedAsset, updateFixedAssetStatus, runDepreciation, FixedAssetError } from "@/lib/finance/fixedAssets";

export async function createAsset(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/aset-tetap`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_FIXED_ASSETS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah aset tetap.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const accountId = formData.get("accountId")?.toString() ?? "";
  const accumulatedDepreciationAccountId = formData.get("accumulatedDepreciationAccountId")?.toString() ?? "";
  const depreciationExpenseAccountId = formData.get("depreciationExpenseAccountId")?.toString() ?? "";
  const assetName = formData.get("assetName")?.toString().trim() ?? "";
  const acquisitionDate = formData.get("acquisitionDate")?.toString() ?? "";
  const acquisitionCost = (formData.get("acquisitionCost")?.toString().trim() || "").replace(",", ".");
  const usefulLifeMonths = Number(formData.get("usefulLifeMonths")?.toString() ?? "");

  const costNum = Number(acquisitionCost);
  if (!accountId || !accumulatedDepreciationAccountId || !depreciationExpenseAccountId || !assetName || !acquisitionDate || !Number.isFinite(costNum) || costNum <= 0 || !Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Semua field wajib diisi dengan benar (harga perolehan > 0, masa manfaat bulat > 0).")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createFixedAsset(tx, {
        companyId,
        accountId,
        accumulatedDepreciationAccountId,
        depreciationExpenseAccountId,
        assetName,
        acquisitionDate,
        acquisitionCost: costNum.toFixed(2),
        usefulLifeMonths,
        userId: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof FixedAssetError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_fixed_asset",
    entityType: "fixed_asset",
    entityId: result.assetId,
    metadata: { assetName, acquisitionCost: costNum, usefulLifeMonths },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function changeAssetStatus(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assetId = formData.get("assetId")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/aset-tetap`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_FIXED_ASSETS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status aset.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });
  if (status !== "aktif" && status !== "dijual" && status !== "dihapuskan") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Status tidak valid.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateFixedAssetStatus(tx, { companyId, assetId, status: status as "aktif" | "dijual" | "dihapuskan" })
    );
  } catch (err) {
    if (err instanceof FixedAssetError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "change_fixed_asset_status",
    entityType: "fixed_asset",
    entityId: assetId,
    metadata: { status },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function runDepreciationAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const redirectBase = `/${companySlug}/keuangan/aset-tetap/penyusutan`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_FIXED_ASSETS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menjalankan penyusutan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12 || !Number.isInteger(periodYear)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Bulan/tahun periode tidak valid.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      runDepreciation(tx, { companyId, periodMonth, periodYear, runBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof FixedAssetError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "run_depreciation",
    entityType: "depreciation_run",
    entityId: result.journalEntryId,
    metadata: { periodMonth, periodYear, entryNumber: result.entryNumber, assetsProcessed: result.assetsProcessed },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
