"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { createOpportunity, changeOpportunityStage, reassignOpportunity, OpportunityError } from "@/lib/crm/opportunities";

export async function createOpportunityAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/opportunities`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OPPORTUNITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat opportunity.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const currentStageId = formData.get("currentStageId")?.toString() ?? "";
  const estimatedValue = formData.get("estimatedValue")?.toString().trim() || null;
  const expectedCloseDate = formData.get("expectedCloseDate")?.toString() || null;
  // staff cuma bisa buat opportunity utk dirinya sendiri (spesifikasi CRM Bagian 4).
  const assignedTo = session.user.role === "staff" ? session.user.id : formData.get("assignedTo")?.toString() || session.user.id;

  if (!organizationId || !title || !currentStageId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Organisasi, judul, dan tahap wajib diisi.")}`);
  }

  let opportunityId: string;
  let contractCreatedId: string | undefined;
  try {
    const result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createOpportunity(tx, { companyId, organizationId, title, currentStageId, estimatedValue, expectedCloseDate, assignedTo, actingUserId: session.user.id })
    );
    opportunityId = result.id;
    contractCreatedId = result.contractCreatedId;
  } catch (err) {
    if (err instanceof OpportunityError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_opportunity",
    entityType: "opportunity",
    entityId: opportunityId,
    metadata: { title, organizationId, assignedTo },
  });

  if (contractCreatedId) {
    await logAudit({
      companyId,
      userId: session.user.id,
      action: "create_contract",
      entityType: "contract",
      entityId: contractCreatedId,
      metadata: { opportunityId, reason: "opportunity_created_in_won_stage" },
    });
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${opportunityId}?success=1`);
}

export async function changeStageAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const opportunityId = formData.get("opportunityId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/opportunities/${opportunityId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OPPORTUNITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah tahap.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const newStageId = formData.get("newStageId")?.toString() ?? "";
  const lostReason = formData.get("lostReason")?.toString().trim() || null;

  if (!newStageId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih tahap tujuan.")}`);
  }

  let contractCreatedId: string | undefined;
  try {
    const result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      changeOpportunityStage(tx, { companyId, opportunityId, newStageId, actingUserId: session.user.id, lostReason })
    );
    contractCreatedId = result.contractCreatedId;
  } catch (err) {
    if (err instanceof OpportunityError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "change_opportunity_stage",
    entityType: "opportunity",
    entityId: opportunityId,
    metadata: { newStageId, lostReason },
  });

  if (contractCreatedId) {
    await logAudit({
      companyId,
      userId: session.user.id,
      action: "create_contract",
      entityType: "contract",
      entityId: contractCreatedId,
      metadata: { opportunityId, reason: "opportunity_moved_to_won_stage" },
    });
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function reassignOpportunityAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const opportunityId = formData.get("opportunityId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/opportunities/${opportunityId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "REASSIGN_OPPORTUNITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin memindahkan pemilik opportunity.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const newAssignedTo = formData.get("newAssignedTo")?.toString() ?? "";
  if (!newAssignedTo) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih staf baru.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    reassignOpportunity(tx, { companyId, opportunityId, newAssignedTo })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "reassign_opportunity",
    entityType: "opportunity",
    entityId: opportunityId,
    metadata: { newAssignedTo },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
