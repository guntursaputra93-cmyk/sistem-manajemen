"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { caseStageEnum } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import {
  createCase,
  updateCase,
  updateCaseStage,
  linkOpportunityToCase,
  linkContractToCase,
  linkServiceAssignmentToCase,
  CaseError,
} from "@/lib/cases/cases";

type CaseStage = (typeof caseStageEnum.enumValues)[number];

export async function createCaseAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat case.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const serviceType = formData.get("serviceType")?.toString().trim() || null;
  const picUserId = formData.get("picUserId")?.toString() || null;
  const targetCloseDate = formData.get("targetCloseDate")?.toString() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!organizationId || !title) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Organisasi dan judul case wajib diisi.")}`);
  }

  let caseId: string;
  try {
    const row = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createCase(tx, { companyId, organizationId, title, serviceType, picUserId, targetCloseDate, notes, createdBy: session.user.id })
    );
    caseId = row.id;
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "create_case", entityType: "case", entityId: caseId, metadata: { title, organizationId } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${caseId}?success=1`);
}

export async function updateCaseAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah case.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const title = formData.get("title")?.toString().trim() ?? "";
  const serviceType = formData.get("serviceType")?.toString().trim() || null;
  const picUserId = formData.get("picUserId")?.toString() || null;
  const targetCloseDate = formData.get("targetCloseDate")?.toString() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!title) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Judul case wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateCase(tx, { companyId, caseId, title, serviceType, picUserId, targetCloseDate, notes })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "update_case", entityType: "case", entityId: caseId, metadata: { title } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateCaseStageAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah tahap case.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const targetStage = formData.get("targetStage")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() ?? "";

  if (!(caseStageEnum.enumValues as readonly string[]).includes(targetStage)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tahap tujuan tidak valid.")}`);
  }
  if (!notes) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Alasan perubahan tahap wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateCaseStage(tx, { companyId, caseId, targetStage: targetStage as CaseStage, notes, changedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "update_case_stage", entityType: "case", entityId: caseId, metadata: { targetStage, notes } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function linkOpportunityAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menautkan opportunity.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const opportunityId = formData.get("opportunityId")?.toString() ?? "";
  if (!opportunityId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih opportunity yang mau ditautkan.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      linkOpportunityToCase(tx, { companyId, caseId, opportunityId })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "link_opportunity_to_case", entityType: "case", entityId: caseId, metadata: { opportunityId } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function linkContractAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menautkan contract.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const contractId = formData.get("contractId")?.toString() ?? "";
  if (!contractId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih contract yang mau ditautkan.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      linkContractToCase(tx, { companyId, caseId, contractId })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "link_contract_to_case", entityType: "case", entityId: caseId, metadata: { contractId } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function linkServiceAssignmentAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menautkan penugasan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  if (!assignmentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih penugasan yang mau ditautkan.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      linkServiceAssignmentToCase(tx, { companyId, caseId, assignmentId })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "link_assignment_to_case", entityType: "case", entityId: caseId, metadata: { assignmentId } });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
