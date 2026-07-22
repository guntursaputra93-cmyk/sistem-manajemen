"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { apBills } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { postBill, recordApPayment, ApError } from "@/lib/finance/ap";
import { JournalError } from "@/lib/finance/journal";

// Nominal ber-format id-ID (titik ribuan, koma desimal) → string numeric untuk DB.
function parseAmount(v: string): number {
  const raw = v.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function createBill(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const listBase = `/${companySlug}/keuangan/hutang`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AP_BILLS")) {
    redirect(`${listBase}?error=${encodeURIComponent("Tidak punya izin mengelola tagihan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const expenseAccountId = formData.get("expenseAccountId")?.toString() ?? "";
  const billDate = formData.get("billDate")?.toString() ?? "";
  const dueDate = formData.get("dueDate")?.toString() ?? "";
  const supplierRef = formData.get("supplierRef")?.toString().trim() || null;
  const description = formData.get("description")?.toString().trim() || null;
  const amount = parseAmount(formData.get("amount")?.toString() ?? "");

  if (!organizationId || !expenseAccountId || !billDate || !dueDate) {
    redirect(`${listBase}?error=${encodeURIComponent("Pemasok, akun beban, tanggal tagihan, dan jatuh tempo wajib diisi.")}`);
  }
  if (!(amount > 0)) {
    redirect(`${listBase}?error=${encodeURIComponent("Nominal tagihan harus lebih dari 0.")}`);
  }
  if (dueDate < billDate) {
    redirect(`${listBase}?error=${encodeURIComponent("Jatuh tempo tidak boleh lebih awal dari tanggal tagihan.")}`);
  }

  const [bill] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(apBills)
      .values({
        companyId,
        organizationId,
        billDate,
        dueDate,
        amount: amount.toFixed(2),
        expenseAccountId,
        supplierRef,
        description,
        createdBy: session.user.id,
      })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_ap_bill",
    entityType: "ap_bill",
    entityId: bill.id,
    metadata: { amount, organizationId },
  });

  revalidatePath(listBase);
  redirect(`${listBase}/${bill.id}?success=1`);
}

export async function postBillAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const billId = formData.get("billId")?.toString() ?? "";
  const detailBase = `/${companySlug}/keuangan/hutang/${billId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AP_BILLS")) {
    redirect(`${detailBase}?error=${encodeURIComponent("Tidak punya izin memposting tagihan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  let result: { billNumber: string };
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      postBill(tx, { companyId, billId, postedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof ApError || err instanceof JournalError) {
      redirect(`${detailBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "post_ap_bill",
    entityType: "ap_bill",
    entityId: billId,
    metadata: { billNumber: result.billNumber },
  });

  revalidatePath(detailBase);
  redirect(`${detailBase}?success=1`);
}

export async function recordApPaymentAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const billId = formData.get("billId")?.toString() ?? "";
  const detailBase = `/${companySlug}/keuangan/hutang/${billId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AP_BILLS")) {
    redirect(`${detailBase}?error=${encodeURIComponent("Tidak punya izin mencatat pembayaran.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const paymentDate = formData.get("paymentDate")?.toString() ?? "";
  const bankAccountId = formData.get("bankAccountId")?.toString() ?? "";
  const referenceNote = formData.get("referenceNote")?.toString().trim() || null;
  const amount = parseAmount(formData.get("amount")?.toString() ?? "");

  if (!paymentDate || !bankAccountId || !(amount > 0)) {
    redirect(`${detailBase}?error=${encodeURIComponent("Tanggal, akun kas/bank, dan nominal pembayaran wajib diisi dengan benar.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      recordApPayment(tx, {
        companyId,
        billId,
        paymentDate,
        amount: amount.toFixed(2),
        bankAccountId,
        referenceNote,
        recordedBy: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof ApError || err instanceof JournalError) {
      redirect(`${detailBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "record_ap_payment",
    entityType: "ap_bill",
    entityId: billId,
    metadata: { amount },
  });

  revalidatePath(detailBase);
  redirect(`${detailBase}?success=1`);
}
