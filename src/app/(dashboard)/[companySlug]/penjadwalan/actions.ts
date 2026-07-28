"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { contracts, organizations, serviceAssignments, serviceAssignmentTeam, witnessedAuditEvaluations, performanceEvaluations, caseServiceAssignments } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { computeCompetencyWarnings } from "@/lib/scheduling/assignments";
import { DEFAULT_WITNESSED_AUDIT_ASPECTS, DEFAULT_PERFORMANCE_EVALUATION_ASPECTS, type EvaluationScore } from "@/lib/scheduling/evaluations";
import { advanceCaseStage } from "@/lib/cases/autoAdvanceStage";

const VALID_STATUSES = ["dijadwalkan", "berlangsung", "selesai", "dibatalkan"] as const;

export async function createServiceAssignment(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat penugasan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  const contractId = formData.get("contractId")?.toString() ?? "";
  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const assignmentDate = formData.get("assignmentDate")?.toString() || "";
  const endDate = formData.get("endDate")?.toString() || null;
  const location = formData.get("location")?.toString().trim() || null;
  const acknowledgeWarning = formData.get("acknowledgeWarning")?.toString() === "true";

  if (!contractId || !employeeId || !assignmentDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Contract, personil, dan tanggal penugasan wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [contract] = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ id: contracts.id, organizationIndustry: organizations.industry })
      .from(contracts)
      .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
      .where(and(eq(contracts.id, contractId), eq(contracts.companyId, companyId)))
  );
  if (!contract) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Contract tidak ditemukan.")}`);
  }

  const warnings = await withTenantContext(tenantContext, (tx) =>
    computeCompetencyWarnings(tx, { companyId, employeeId, organizationIndustry: contract.organizationIndustry })
  );

  if (warnings.length > 0 && !acknowledgeWarning) {
    redirect(`${redirectBase}?error=${encodeURIComponent(`Peringatan kompetensi: ${warnings.join(" ")} Centang konfirmasi untuk tetap melanjutkan.`)}`);
  }

  const [assignment] = await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(serviceAssignments)
      .values({
        companyId,
        contractId,
        employeeId,
        assignmentDate,
        endDate,
        location,
        competencyWarningAcknowledged: warnings.length > 0,
        createdBy: session.user.id,
      })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_service_assignment",
    entityType: "service_assignment",
    entityId: assignment.id,
    metadata: { contractId, employeeId, assignmentDate, competencyWarningAcknowledged: warnings.length > 0 },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${assignment.id}?success=1`);
}

export async function updateServiceAssignmentDetails(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah penugasan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  const assignmentDate = formData.get("assignmentDate")?.toString() || "";
  const endDate = formData.get("endDate")?.toString() || null;
  const location = formData.get("location")?.toString().trim() || null;

  if (!assignmentDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal penugasan wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(serviceAssignments)
      .set({ assignmentDate, endDate, location, updatedAt: new Date() })
      .where(and(eq(serviceAssignments.id, assignmentId), eq(serviceAssignments.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_service_assignment",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { assignmentDate, endDate, location },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateServiceAssignmentStatus(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status penugasan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Status tidak valid.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
    await tx
      .update(serviceAssignments)
      .set({ status: status as (typeof VALID_STATUSES)[number], updatedAt: new Date() })
      .where(and(eq(serviceAssignments.id, assignmentId), eq(serviceAssignments.companyId, companyId)));

    // Auto-advance stage (langkah 1.6) — assignment 'berlangsung' => tiap case terhubung maju ke 'pelaksanaan'.
    if (status === "berlangsung") {
      const links = await tx
        .select({ caseId: caseServiceAssignments.caseId })
        .from(caseServiceAssignments)
        .where(and(eq(caseServiceAssignments.assignmentId, assignmentId), eq(caseServiceAssignments.companyId, companyId)));
      for (const link of links) {
        await advanceCaseStage(tx, link.caseId, "pelaksanaan", "assignment_started");
      }
    }
  });

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_service_assignment_status",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { status },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function addTeamMember(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah anggota tim.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  const employeeId = formData.get("employeeId")?.toString() ?? "";
  const roleInTeam = formData.get("roleInTeam")?.toString().trim() || null;

  if (!employeeId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih karyawan untuk ditambahkan ke tim.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [assignment] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(serviceAssignments).where(and(eq(serviceAssignments.id, assignmentId), eq(serviceAssignments.companyId, companyId)))
  );
  if (!assignment) redirect(`${redirectBase}?error=${encodeURIComponent("Penugasan tidak ditemukan.")}`);

  if (assignment.employeeId === employeeId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Karyawan ini sudah jadi personil utama penugasan.")}`);
  }

  const existing = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(serviceAssignmentTeam)
      .where(and(eq(serviceAssignmentTeam.assignmentId, assignmentId), eq(serviceAssignmentTeam.employeeId, employeeId)))
  );
  if (existing.length > 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Karyawan ini sudah tercatat sebagai anggota tim.")}`);
  }

  await withTenantContext(tenantContext, (tx) =>
    tx.insert(serviceAssignmentTeam).values({ companyId, assignmentId, employeeId, roleInTeam })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "add_service_assignment_team_member",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { employeeId, roleInTeam },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function removeTeamMember(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const teamMemberId = formData.get("teamMemberId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menghapus anggota tim.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.delete(serviceAssignmentTeam).where(and(eq(serviceAssignmentTeam.id, teamMemberId), eq(serviceAssignmentTeam.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "remove_service_assignment_team_member",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { teamMemberId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createWitnessedAuditEvaluation(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_WITNESSED_AUDIT_EVALUATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat evaluasi witnessed audit.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  const observerEmployeeId = formData.get("observerEmployeeId")?.toString() ?? "";
  const evaluationDate = formData.get("evaluationDate")?.toString() || "";
  const feedbackNotes = formData.get("feedbackNotes")?.toString().trim() || null;

  if (!observerEmployeeId || !evaluationDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Observer dan tanggal evaluasi wajib diisi.")}`);
  }

  const scores: EvaluationScore[] = [];
  for (let i = 0; i < DEFAULT_WITNESSED_AUDIT_ASPECTS.length; i++) {
    const raw = formData.get(`score_${i}`)?.toString() ?? "";
    const score = Number(raw);
    if (!raw || !Number.isInteger(score) || score < 1 || score > 4) {
      redirect(`${redirectBase}?error=${encodeURIComponent(`Skor untuk aspek "${DEFAULT_WITNESSED_AUDIT_ASPECTS[i]}" wajib diisi (1-4).`)}`);
    }
    scores.push({ aspect: DEFAULT_WITNESSED_AUDIT_ASPECTS[i], score });
  }

  const [evaluation] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
    const inserted = await tx
      .insert(witnessedAuditEvaluations)
      .values({ companyId, assignmentId, observerEmployeeId, evaluationDate, scores, feedbackNotes })
      .returning();

    // Auto-advance stage (langkah 1.6) — evaluasi dibuat => tiap case terhubung ke assignment ini maju ke 'review'.
    const links = await tx
      .select({ caseId: caseServiceAssignments.caseId })
      .from(caseServiceAssignments)
      .where(and(eq(caseServiceAssignments.assignmentId, assignmentId), eq(caseServiceAssignments.companyId, companyId)));
    for (const link of links) {
      await advanceCaseStage(tx, link.caseId, "review", "evaluation_created");
    }

    return inserted;
  });

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_witnessed_audit_evaluation",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { evaluationId: evaluation.id, observerEmployeeId, evaluationDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function toggleEvaluationSigned(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const evaluationId = formData.get("evaluationId")?.toString() ?? "";
  const field = formData.get("field")?.toString() ?? "";
  const nextSigned = formData.get("nextSigned")?.toString() === "true";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_WITNESSED_AUDIT_EVALUATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status tanda tangan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  if (field !== "observerSigned" && field !== "auditeeSigned") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Field tanda tangan tidak valid.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(witnessedAuditEvaluations)
      .set(field === "observerSigned" ? { observerSigned: nextSigned } : { auditeeSigned: nextSigned })
      .where(and(eq(witnessedAuditEvaluations.id, evaluationId), eq(witnessedAuditEvaluations.companyId, companyId)))
  );

  // Status tanda tangan adalah bukti utama untuk audit ISO/SMK3 — dan karena ini
  // toggle (bisa nyala-mati berulang), tanpa jejak tiap perubahannya tidak
  // terlacak sama sekali. field & nextSigned dicatat supaya urutannya terbaca.
  await logAudit({
    companyId,
    userId: session.user.id,
    action: "toggle_witnessed_audit_evaluation_signed",
    entityType: "witnessed_audit_evaluation",
    entityId: evaluationId,
    metadata: { assignmentId, field, signed: nextSigned },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createPerformanceEvaluation(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_PERFORMANCE_EVALUATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat evaluasi kinerja.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  const evaluatorEmployeeId = formData.get("evaluatorEmployeeId")?.toString() ?? "";
  const evaluationDate = formData.get("evaluationDate")?.toString() || "";
  const conclusionNotes = formData.get("conclusionNotes")?.toString().trim() || null;

  if (!evaluatorEmployeeId || !evaluationDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Evaluator dan tanggal evaluasi wajib diisi.")}`);
  }

  const scores: EvaluationScore[] = [];
  for (let i = 0; i < DEFAULT_PERFORMANCE_EVALUATION_ASPECTS.length; i++) {
    const raw = formData.get(`score_${i}`)?.toString() ?? "";
    const score = Number(raw);
    if (!raw || !Number.isInteger(score) || score < 1 || score > 4) {
      redirect(`${redirectBase}?error=${encodeURIComponent(`Skor untuk aspek "${DEFAULT_PERFORMANCE_EVALUATION_ASPECTS[i]}" wajib diisi (1-4).`)}`);
    }
    scores.push({ aspect: DEFAULT_PERFORMANCE_EVALUATION_ASPECTS[i], score });
  }

  const [evaluation] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
    const inserted = await tx
      .insert(performanceEvaluations)
      .values({ companyId, assignmentId, evaluatorEmployeeId, evaluationDate, scores, conclusionNotes })
      .returning();

    // Auto-advance stage (langkah 1.6) — evaluasi dibuat => tiap case terhubung ke assignment ini maju ke 'review'.
    const links = await tx
      .select({ caseId: caseServiceAssignments.caseId })
      .from(caseServiceAssignments)
      .where(and(eq(caseServiceAssignments.assignmentId, assignmentId), eq(caseServiceAssignments.companyId, companyId)));
    for (const link of links) {
      await advanceCaseStage(tx, link.caseId, "review", "evaluation_created");
    }

    return inserted;
  });

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_performance_evaluation",
    entityType: "service_assignment",
    entityId: assignmentId,
    metadata: { evaluationId: evaluation.id, evaluatorEmployeeId, evaluationDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function togglePerformanceEvaluationSigned(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const evaluationId = formData.get("evaluationId")?.toString() ?? "";
  const field = formData.get("field")?.toString() ?? "";
  const nextSigned = formData.get("nextSigned")?.toString() === "true";
  const redirectBase = `/${companySlug}/penjadwalan/${assignmentId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_PERFORMANCE_EVALUATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status tanda tangan.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "penjadwalan_layanan" });

  if (field !== "evaluatorSigned" && field !== "knownByTechnicalManagerSigned") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Field tanda tangan tidak valid.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(performanceEvaluations)
      .set(field === "evaluatorSigned" ? { evaluatorSigned: nextSigned } : { knownByTechnicalManagerSigned: nextSigned })
      .where(and(eq(performanceEvaluations.id, evaluationId), eq(performanceEvaluations.companyId, companyId)))
  );

  // Sama seperti toggleEvaluationSigned — tanda tangan evaluasi kinerja adalah
  // bukti pertanggungjawaban personil, wajib punya jejak per perubahan.
  await logAudit({
    companyId,
    userId: session.user.id,
    action: "toggle_performance_evaluation_signed",
    entityType: "performance_evaluation",
    entityId: evaluationId,
    metadata: { assignmentId, field, signed: nextSigned },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
