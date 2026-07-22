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
  createMilestone,
  updateMilestone,
  completeMilestone,
  deleteMilestone,
  createDeliverable,
  updateDeliverable,
  createExternalSubmission,
  updateSubmissionStatus,
  CaseError,
} from "@/lib/cases/cases";

function parseOptionalStage(raw: string | null | undefined): CaseStage | null {
  const v = raw?.toString() || "";
  return (caseStageEnum.enumValues as readonly string[]).includes(v) ? (v as CaseStage) : null;
}

function parseOptionalInt(raw: string | null | undefined): number | null {
  const v = raw?.toString().trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
}

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

// ============================================================================
// Langkah 1.7B — server actions tabel pendukung (milestones/deliverables/
// external submissions). Pola sama persis 1.7A: gate MANAGE_CASES +
// modul case_management, CaseError->redirect, logAudit, redirect ke detail case.
// ============================================================================

export async function createMilestoneAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah milestone.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const milestoneKey = formData.get("milestoneKey")?.toString().trim() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const stage = parseOptionalStage(formData.get("stage")?.toString());
  const dueDate = formData.get("dueDate")?.toString() || null;
  const sortOrder = parseOptionalInt(formData.get("sortOrder")?.toString());

  if (!milestoneKey || !title) {
    redirect(`${redirectBase}?error=${encodeURIComponent("milestone_key dan judul wajib diisi.")}`);
  }

  let milestoneId: string;
  try {
    const row = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createMilestone(tx, { companyId, caseId, milestoneKey, title, stage, dueDate, sortOrder })
    );
    milestoneId = row.id;
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "create_case_milestone", entityType: "case_milestone", entityId: milestoneId, metadata: { caseId, title } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateMilestoneAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const milestoneId = formData.get("milestoneId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah milestone.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const milestoneKey = formData.get("milestoneKey")?.toString().trim() ?? "";
  const title = formData.get("title")?.toString().trim() ?? "";
  const stage = parseOptionalStage(formData.get("stage")?.toString());
  const status = formData.get("status")?.toString().trim() ?? "";
  const dueDate = formData.get("dueDate")?.toString() || null;
  const sortOrder = parseOptionalInt(formData.get("sortOrder")?.toString());
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!milestoneKey || !title || !status) {
    redirect(`${redirectBase}?error=${encodeURIComponent("milestone_key, judul, dan status wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateMilestone(tx, { companyId, milestoneId, milestoneKey, title, stage, status, dueDate, sortOrder, notes })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "update_case_milestone", entityType: "case_milestone", entityId: milestoneId, metadata: { caseId, status } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function completeMilestoneAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const milestoneId = formData.get("milestoneId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menyelesaikan milestone.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      completeMilestone(tx, { companyId, milestoneId, completedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "complete_case_milestone", entityType: "case_milestone", entityId: milestoneId, metadata: { caseId } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteMilestoneAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const milestoneId = formData.get("milestoneId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menghapus milestone.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      deleteMilestone(tx, { companyId, milestoneId })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "delete_case_milestone", entityType: "case_milestone", entityId: milestoneId, metadata: { caseId } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createDeliverableAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah deliverable.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const deliverableType = formData.get("deliverableType")?.toString().trim() ?? "";
  const deliverableNumber = formData.get("deliverableNumber")?.toString().trim() || null;
  const barcodeValue = formData.get("barcodeValue")?.toString().trim() || null;
  const issuedDate = formData.get("issuedDate")?.toString() || null;
  const validUntil = formData.get("validUntil")?.toString() || null;
  const fileAttachmentId = formData.get("fileAttachmentId")?.toString() || null;

  if (!deliverableType) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis deliverable wajib diisi.")}`);
  }

  let deliverableId: string;
  try {
    const row = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createDeliverable(tx, { companyId, caseId, deliverableType, deliverableNumber, barcodeValue, issuedDate, validUntil, fileAttachmentId })
    );
    deliverableId = row.id;
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "create_case_deliverable", entityType: "case_deliverable", entityId: deliverableId, metadata: { caseId, deliverableType } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateDeliverableAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const deliverableId = formData.get("deliverableId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah deliverable.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const deliverableType = formData.get("deliverableType")?.toString().trim() ?? "";
  const deliverableNumber = formData.get("deliverableNumber")?.toString().trim() || null;
  const barcodeValue = formData.get("barcodeValue")?.toString().trim() || null;
  const issuedDate = formData.get("issuedDate")?.toString() || null;
  const validUntil = formData.get("validUntil")?.toString() || null;
  const status = formData.get("status")?.toString().trim() ?? "";
  const fileAttachmentId = formData.get("fileAttachmentId")?.toString() || null;

  if (!deliverableType || !status) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis dan status deliverable wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateDeliverable(tx, { companyId, deliverableId, deliverableType, deliverableNumber, barcodeValue, issuedDate, validUntil, status, fileAttachmentId })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "update_case_deliverable", entityType: "case_deliverable", entityId: deliverableId, metadata: { caseId, status } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createExternalSubmissionAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah pengajuan.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const externalPartyName = formData.get("externalPartyName")?.toString().trim() ?? "";
  const submissionType = formData.get("submissionType")?.toString().trim() || null;
  const trackingNumber = formData.get("trackingNumber")?.toString().trim() || null;

  if (!externalPartyName) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama pihak luar wajib diisi.")}`);
  }

  let submissionId: string;
  try {
    const row = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createExternalSubmission(tx, { companyId, caseId, externalPartyName, submissionType, trackingNumber, createdBy: session.user.id })
    );
    submissionId = row.id;
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "create_case_external_submission", entityType: "case_external_submission", entityId: submissionId, metadata: { caseId, externalPartyName } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateSubmissionStatusAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const caseId = formData.get("caseId")?.toString() ?? "";
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/cases/${caseId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin memperbarui status pengajuan.")}`);
  }
  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "case_management" });

  const newStatus = formData.get("newStatus")?.toString().trim() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!newStatus) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Status baru wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      updateSubmissionStatus(tx, { companyId, submissionId, newStatus, notes, reportedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof CaseError) redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    throw err;
  }

  await logAudit({ companyId, userId: session.user.id, action: "update_case_submission_status", entityType: "case_external_submission", entityId: submissionId, metadata: { caseId, newStatus } });
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
