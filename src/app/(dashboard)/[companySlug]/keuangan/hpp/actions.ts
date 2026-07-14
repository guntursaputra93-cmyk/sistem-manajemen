"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { recordProjectCost, HppError } from "@/lib/finance/hpp";

export async function createProjectCost(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/hpp`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_HPP_PROJECT_COSTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat biaya proyek.")}`);
  }

  const contractId = formData.get("contractId")?.toString() ?? "";
  const costDate = formData.get("costDate")?.toString() ?? "";
  const hppAccountId = formData.get("hppAccountId")?.toString() ?? "";
  const offsetAccountId = formData.get("offsetAccountId")?.toString() ?? "";
  const amount = (formData.get("amount")?.toString().trim() || "").replace(",", ".");
  const description = formData.get("description")?.toString().trim() || null;

  const amountNum = Number(amount);
  if (!contractId || !costDate || !hppAccountId || !offsetAccountId || !Number.isFinite(amountNum) || amountNum <= 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kontrak, tanggal, akun HPP, akun lawan, dan nominal (>0) wajib diisi dengan benar.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      recordProjectCost(tx, {
        companyId,
        contractId,
        costDate,
        hppAccountId,
        offsetAccountId,
        amount: amountNum.toFixed(2),
        description,
        recordedBy: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof HppError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "record_hpp_project_cost",
    entityType: "hpp_project_cost",
    entityId: result.costId,
    metadata: { contractId, amount: amountNum, hppAccountId, offsetAccountId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
