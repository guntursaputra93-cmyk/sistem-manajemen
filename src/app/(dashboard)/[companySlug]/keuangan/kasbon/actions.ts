"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { createKasbonRequest, approveAndDisburseKasbon, rejectKasbon, KasbonError } from "@/lib/hr/kasbon";

export async function createKasbonRequestAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/kasbon`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_KASBON_REQUEST")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengajukan kasbon.")}`);
  }

  const totalAmount = (formData.get("totalAmount")?.toString().trim() || "").replace(",", ".");
  const installmentAmount = (formData.get("installmentAmount")?.toString().trim() || "").replace(",", ".");
  const purpose = formData.get("purpose")?.toString().trim() ?? "";

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId, userId: session.user.id }));
  if (!employee) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun Anda belum terhubung ke data karyawan — hubungi admin.")}`);
  }

  try {
    await withTenantContext(tenantContext, (tx) =>
      createKasbonRequest(tx, {
        companyId,
        employeeId: employee.id,
        totalAmount,
        installmentAmount,
        purpose,
        requestDate: new Date().toISOString().slice(0, 10),
      })
    );
  } catch (err) {
    if (err instanceof KasbonError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_kasbon_request",
    entityType: "kasbon_request",
    entityId: employee.id,
    metadata: { totalAmount, installmentAmount, purpose },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function approveKasbonAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const kasbonRequestId = formData.get("kasbonRequestId")?.toString() ?? "";
  const disbursementAccountId = formData.get("disbursementAccountId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/kasbon`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_KASBON_REQUESTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menyetujui kasbon.")}`);
  }
  if (!disbursementAccountId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun kas/bank pencairan wajib dipilih.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId, userId: session.user.id }, (tx) =>
      approveAndDisburseKasbon(tx, { companyId, kasbonRequestId, approverId: session.user.id, disbursementAccountId })
    );
  } catch (err) {
    if (err instanceof KasbonError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "approve_disburse_kasbon",
    entityType: "kasbon_request",
    entityId: kasbonRequestId,
    metadata: { disbursementAccountId, entryNumber: result.entryNumber },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function rejectKasbonAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const kasbonRequestId = formData.get("kasbonRequestId")?.toString() ?? "";
  const rejectionReason = formData.get("rejectionReason")?.toString().trim() ?? "";
  const redirectBase = `/${companySlug}/keuangan/kasbon`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_KASBON_REQUESTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menolak kasbon.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId, userId: session.user.id }, (tx) =>
      rejectKasbon(tx, { companyId, kasbonRequestId, approverId: session.user.id, rejectionReason })
    );
  } catch (err) {
    if (err instanceof KasbonError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "reject_kasbon_request",
    entityType: "kasbon_request",
    entityId: kasbonRequestId,
    metadata: { rejectionReason },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
