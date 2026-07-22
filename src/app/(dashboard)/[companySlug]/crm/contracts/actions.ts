"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { contracts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { updateContract, ContractError } from "@/lib/crm/contracts";

const PAYMENT_STATUS_VALUES = ["belum_dibayar", "sebagian", "lunas"] as const;

export async function updateContractAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const contractId = formData.get("contractId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/contracts/${contractId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CONTRACTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah contract.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const contractValue = formData.get("contractValue")?.toString().trim() ?? "";
  const startDate = formData.get("startDate")?.toString() ?? "";
  const endDate = formData.get("endDate")?.toString() || null;
  const paymentStatus = formData.get("paymentStatus")?.toString() ?? "";
  const renewalReminderDate = formData.get("renewalReminderDate")?.toString() || null;

  if (!contractValue || !startDate || !PAYMENT_STATUS_VALUES.includes(paymentStatus as (typeof PAYMENT_STATUS_VALUES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nilai kontrak, tanggal mulai, dan status pembayaran wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [before] = await withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.companyId, companyId))));

  try {
    await withTenantContext(tenantContext, (tx) =>
      updateContract(tx, {
        companyId,
        contractId,
        contractValue,
        startDate,
        endDate,
        paymentStatus: paymentStatus as (typeof PAYMENT_STATUS_VALUES)[number],
        renewalReminderDate,
      })
    );
  } catch (err) {
    if (err instanceof ContractError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_contract",
    entityType: "contract",
    entityId: contractId,
    metadata: { previousContractValue: before?.contractValue ?? null, newContractValue: contractValue, paymentStatus },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
