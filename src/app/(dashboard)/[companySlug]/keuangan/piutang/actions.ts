"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { arInvoices, contracts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { postInvoice, recordPayment, ArError } from "@/lib/finance/ar";

export async function createInvoice(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/piutang`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AR_INVOICES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat invoice.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const contractId = formData.get("contractId")?.toString() ?? "";
  const revenueAccountId = formData.get("revenueAccountId")?.toString() ?? "";
  const invoiceDate = formData.get("invoiceDate")?.toString() ?? "";
  const dueDate = formData.get("dueDate")?.toString() ?? "";
  const amount = (formData.get("amount")?.toString().trim() || "").replace(",", ".");
  const description = formData.get("description")?.toString().trim() || null;

  const amountNum = Number(amount);
  if (!contractId || !revenueAccountId || !invoiceDate || !dueDate || !Number.isFinite(amountNum) || amountNum <= 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kontrak, akun pendapatan, tanggal, dan nominal (>0) wajib diisi dengan benar.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [contract] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.companyId, companyId)))
  );
  if (!contract) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kontrak tidak ditemukan.")}`);
  }

  const [invoice] = await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(arInvoices)
      .values({ companyId, contractId, revenueAccountId, invoiceDate, dueDate, amount: amountNum.toFixed(2), description, createdBy: session.user.id })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_ar_invoice",
    entityType: "ar_invoice",
    entityId: invoice.id,
    metadata: { contractId, amount: amountNum, invoiceDate, dueDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${invoice.id}?success=1`);
}

export async function postInvoiceAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const invoiceId = formData.get("invoiceId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/piutang/${invoiceId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AR_INVOICES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin memposting invoice.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      postInvoice(tx, { companyId, invoiceId, postedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof ArError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "post_ar_invoice",
    entityType: "ar_invoice",
    entityId: invoiceId,
    metadata: { invoiceNumber: result.invoiceNumber },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const invoiceId = formData.get("invoiceId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/piutang/${invoiceId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_AR_INVOICES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat pembayaran.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const paymentDate = formData.get("paymentDate")?.toString() ?? "";
  const amount = (formData.get("amount")?.toString().trim() || "").replace(",", ".");
  const bankAccountId = formData.get("bankAccountId")?.toString() ?? "";
  const referenceNote = formData.get("referenceNote")?.toString().trim() || null;

  const amountNum = Number(amount);
  if (!paymentDate || !bankAccountId || !Number.isFinite(amountNum) || amountNum <= 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal, akun bank, dan nominal (>0) wajib diisi dengan benar.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      recordPayment(tx, {
        companyId,
        invoiceId,
        paymentDate,
        amount: amountNum.toFixed(2),
        bankAccountId,
        referenceNote,
        recordedBy: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof ArError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "record_ar_payment",
    entityType: "ar_invoice",
    entityId: invoiceId,
    metadata: { amount: amountNum, bankAccountId, paymentDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
