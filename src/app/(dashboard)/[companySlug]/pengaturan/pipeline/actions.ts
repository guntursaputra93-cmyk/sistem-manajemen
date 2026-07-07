"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { pipelineStages } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { deletePipelineStage, updatePipelineStageFlags, PipelineStageError } from "@/lib/crm/pipeline";

export async function addPipelineStage(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/pipeline`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur pipeline.")}`);
  }

  const stageKey = formData.get("stageKey")?.toString().trim() ?? "";
  const stageOrder = Number.parseInt(formData.get("stageOrder")?.toString() ?? "", 10);
  const isWonStage = formData.get("isWonStage")?.toString() === "true";
  const isLostStage = formData.get("isLostStage")?.toString() === "true";

  if (!stageKey) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama tahap (stage_key) wajib diisi.")}`);
  }
  if (!Number.isInteger(stageOrder) || stageOrder < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Urutan tahap harus angka >= 1.")}`);
  }
  if (isWonStage && isLostStage) {
    redirect(`${redirectBase}?error=${encodeURIComponent("1 tahap tidak bisa jadi 'menang' dan 'hilang' sekaligus.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(pipelineStages).values({ companyId, stageKey, stageOrder, isWonStage, isLostStage })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama tahap ini sudah ada di perusahaan ini.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_pipeline_stage",
    entityType: "pipeline_stage",
    metadata: { stageKey, stageOrder, isWonStage, isLostStage },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updatePipelineStage(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const stageId = formData.get("stageId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/pipeline`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur pipeline.")}`);
  }

  const stageKey = formData.get("stageKey")?.toString().trim() ?? "";
  const stageOrder = Number.parseInt(formData.get("stageOrder")?.toString() ?? "", 10);
  const isWonStage = formData.get("isWonStage")?.toString() === "true";
  const isLostStage = formData.get("isLostStage")?.toString() === "true";

  if (!stageKey) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama tahap (stage_key) wajib diisi.")}`);
  }
  if (!Number.isInteger(stageOrder) || stageOrder < 1) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Urutan tahap harus angka >= 1.")}`);
  }
  if (isWonStage && isLostStage) {
    redirect(`${redirectBase}?error=${encodeURIComponent("1 tahap tidak bisa jadi 'menang' dan 'hilang' sekaligus.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
      await updatePipelineStageFlags(tx, { companyId, stageId, isWonStage, isLostStage });
      await tx
        .update(pipelineStages)
        .set({ stageKey, stageOrder, isWonStage, isLostStage })
        .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.companyId, companyId)));
    });
  } catch (err) {
    if (err instanceof PipelineStageError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama tahap ini sudah ada di perusahaan ini.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_pipeline_stage",
    entityType: "pipeline_stage",
    entityId: stageId,
    metadata: { stageKey, stageOrder, isWonStage, isLostStage },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function removePipelineStage(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const stageId = formData.get("stageId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/pipeline`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur pipeline.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      deletePipelineStage(tx, { companyId, stageId })
    );
  } catch (err) {
    if (err instanceof PipelineStageError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_pipeline_stage",
    entityType: "pipeline_stage",
    entityId: stageId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
