"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { openBankReconciliation, setStatementEndingBalance, setItemCleared, completeBankReconciliation, addManualReconciliationItem, BankReconciliationError } from "@/lib/finance/bankReconciliation";
import { JournalError } from "@/lib/finance/journal";

export async function openBankReconciliationAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const bankAccountId = formData.get("bankAccountId")?.toString() ?? "";
  const periodMonth = Number(formData.get("periodMonth")?.toString() ?? "");
  const periodYear = Number(formData.get("periodYear")?.toString() ?? "");
  const redirectBase = `/${companySlug}/keuangan/rekonsiliasi-bank`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuka rekonsiliasi bank.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });
  if (!bankAccountId || !Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12 || !Number.isInteger(periodYear)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun bank dan periode wajib diisi dengan benar.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      openBankReconciliation(tx, { companyId, bankAccountId, periodMonth, periodYear, createdBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof BankReconciliationError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "open_bank_reconciliation",
    entityType: "bank_reconciliation",
    entityId: result.reconciliationId,
    metadata: { bankAccountId, periodMonth, periodYear, itemCount: result.itemCount },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${result.reconciliationId}?success=1`);
}

export async function setStatementEndingBalanceAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const reconciliationId = formData.get("reconciliationId")?.toString() ?? "";
  const statementEndingBalance = (formData.get("statementEndingBalance")?.toString().trim() || "").replace(",", ".");
  const redirectBase = `/${companySlug}/keuangan/rekonsiliasi-bank/${reconciliationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah rekonsiliasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });
  const amountNum = Number(statementEndingBalance);
  if (!Number.isFinite(amountNum)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Saldo rekening koran wajib diisi dengan angka yang valid.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      setStatementEndingBalance(tx, { companyId, reconciliationId, statementEndingBalance: amountNum.toFixed(2) })
    );
  } catch (err) {
    if (err instanceof BankReconciliationError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function addManualReconciliationItemAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const reconciliationId = formData.get("reconciliationId")?.toString() ?? "";
  const counterAccountId = formData.get("counterAccountId")?.toString() ?? "";
  const directionRaw = formData.get("direction")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const amountRaw = (formData.get("amount")?.toString().trim() || "").replace(/\./g, "").replace(",", ".");
  const redirectBase = `/${companySlug}/keuangan/rekonsiliasi-bank/${reconciliationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah rekonsiliasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const amount = Number(amountRaw);
  const direction = directionRaw === "tambah" ? "tambah" : directionRaw === "kurang" ? "kurang" : null;
  if (!counterAccountId || !direction || !description || !Number.isFinite(amount) || amount <= 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun lawan, arah, keterangan, dan nominal (> 0) wajib diisi dengan benar.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      addManualReconciliationItem(tx, {
        companyId,
        reconciliationId,
        counterAccountId,
        amount,
        direction: direction as "kurang" | "tambah",
        description,
        addedBy: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof BankReconciliationError || err instanceof JournalError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "add_manual_reconciliation_item",
    entityType: "bank_reconciliation",
    entityId: reconciliationId,
    metadata: { amount, direction, counterAccountId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function setItemClearedAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const reconciliationId = formData.get("reconciliationId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const isCleared = formData.get("isCleared")?.toString() === "true";
  const notes = formData.get("notes")?.toString().trim() || null;
  const redirectBase = `/${companySlug}/keuangan/rekonsiliasi-bank/${reconciliationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah rekonsiliasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      setItemCleared(tx, { companyId, reconciliationId, itemId, isCleared, notes })
    );
  } catch (err) {
    if (err instanceof BankReconciliationError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function completeBankReconciliationAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const reconciliationId = formData.get("reconciliationId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/rekonsiliasi-bank/${reconciliationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menyelesaikan rekonsiliasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      completeBankReconciliation(tx, { companyId, reconciliationId, completedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof BankReconciliationError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "complete_bank_reconciliation",
    entityType: "bank_reconciliation",
    entityId: reconciliationId,
    metadata: {},
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
