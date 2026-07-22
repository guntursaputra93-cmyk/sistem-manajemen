"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { upsertBudget, setMonthlyBreakdown, RkapError } from "@/lib/finance/rkap";

export async function createOrUpdateBudget(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const year = Number(formData.get("year")?.toString() ?? "");
  const redirectBase = `/${companySlug}/keuangan/rkap?year=${year}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_RKAP_BUDGETS")) {
    redirect(`${redirectBase}&error=${encodeURIComponent("Tidak punya izin mengatur RKAP.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const accountId = formData.get("accountId")?.toString() ?? "";
  const budgetedAmount = (formData.get("budgetedAmount")?.toString().trim() || "").replace(",", ".");
  const description = formData.get("description")?.toString().trim() || null;

  const amountNum = Number(budgetedAmount);
  if (!accountId || !Number.isFinite(year) || !Number.isFinite(amountNum) || amountNum < 0) {
    redirect(`${redirectBase}&error=${encodeURIComponent("Akun, tahun, dan nominal anggaran (>=0) wajib diisi dengan benar.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      upsertBudget(tx, { companyId, accountId, year, budgetedAmount: amountNum.toFixed(2), description, userId: session.user.id })
    );
  } catch (err) {
    if (err instanceof RkapError) {
      redirect(`${redirectBase}&error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "upsert_rkap_budget",
    entityType: "rkap_budget",
    entityId: result.budgetId,
    metadata: { accountId, year, budgetedAmount: amountNum },
  });

  revalidatePath(`/${companySlug}/keuangan/rkap`);
  redirect(`${redirectBase}&success=1`);
}

export async function saveMonthlyBreakdown(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const budgetId = formData.get("budgetId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/rkap/${budgetId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_RKAP_BUDGETS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur RKAP.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const monthlyAmounts = Array.from({ length: 12 }, (_, idx) => (formData.get(`month_${idx + 1}`)?.toString().trim() || "0").replace(",", "."));

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      setMonthlyBreakdown(tx, { companyId, budgetId, monthlyAmounts: monthlyAmounts.map((v) => Number(v).toFixed(2)), userId: session.user.id })
    );
  } catch (err) {
    if (err instanceof RkapError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "set_rkap_budget_monthly",
    entityType: "rkap_budget",
    entityId: budgetId,
    metadata: { monthlyAmounts },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
