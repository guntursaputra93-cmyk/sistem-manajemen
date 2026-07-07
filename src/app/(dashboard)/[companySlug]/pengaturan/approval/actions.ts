"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { approvalFlows } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

const APPLIES_TO_VALUES = ["surat_keluar", "nota_dinas", "dokumen"] as const;
const ROLE_VALUES = ["super_admin", "company_admin", "department_head", "staff"] as const;

export async function addApprovalStep(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/approval`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenjang approval.")}`);
  }

  const appliesTo = formData.get("appliesTo")?.toString() ?? "";
  const jenisKey = formData.get("jenisKey")?.toString().trim() ?? "";
  const stepOrderRaw = formData.get("stepOrder")?.toString() ?? "";
  const approverMode = formData.get("approverMode")?.toString() ?? "";
  const requiredRole = formData.get("requiredRole")?.toString() ?? "";
  const requiredApproverUserId = formData.get("requiredApproverUserId")?.toString() ?? "";

  const stepOrder = Number.parseInt(stepOrderRaw, 10);

  if (!APPLIES_TO_VALUES.includes(appliesTo as (typeof APPLIES_TO_VALUES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis entity tidak valid.")}`);
  }
  if (!jenisKey) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis (jenis_key) wajib diisi.")}`);
  }
  if (!Number.isInteger(stepOrder) || stepOrder < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Urutan jenjang harus angka >= 1.")}`);
  }
  if (approverMode === "role" && !ROLE_VALUES.includes(requiredRole as (typeof ROLE_VALUES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Role tidak valid.")}`);
  }
  if (approverMode === "user" && !requiredApproverUserId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih orang yang berwenang.")}`);
  }
  if (approverMode !== "role" && approverMode !== "user") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih berdasarkan role atau orang spesifik.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(approvalFlows).values({
        companyId: session.user.companyId,
        appliesTo: appliesTo as (typeof APPLIES_TO_VALUES)[number],
        jenisKey,
        stepOrder,
        requiredRole: approverMode === "role" ? (requiredRole as (typeof ROLE_VALUES)[number]) : null,
        requiredApproverUserId: approverMode === "user" ? requiredApproverUserId : null,
      })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kombinasi jenis + urutan jenjang ini sudah ada.")}`);
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "create_approval_flow_step",
    entityType: "approval_flow",
    metadata: { appliesTo, jenisKey, stepOrder, approverMode, requiredRole, requiredApproverUserId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteApprovalStep(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const id = formData.get("id")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/approval`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur jenjang approval.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.delete(approvalFlows).where(and(eq(approvalFlows.id, id), eq(approvalFlows.companyId, session.user.companyId)))
  );

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "delete_approval_flow_step",
    entityType: "approval_flow",
    entityId: id,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
