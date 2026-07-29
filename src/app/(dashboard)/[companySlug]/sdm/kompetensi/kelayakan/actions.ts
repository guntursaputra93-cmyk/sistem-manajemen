"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, users, practitionerEligibilitySettings } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { recordApprovalDecision, ApprovalError } from "@/lib/approval/flows";
import {
  generateEvaluations,
  submitForApproval,
  syncFinalStatus,
  ELIGIBILITY_ENTITY_TYPE,
} from "@/lib/hr/practitionerEligibility";

// AUDIT-E1 — server actions evaluasi kelayakan personil.
// Semua aksi mencatat logAudit (entityType + entityId terisi) supaya cakupan
// 100% dari AUDIT-C tidak mundur karena modul baru ini.

const MODULE_KEY = "sdm_kompetensi" as const;

async function guard(companySlug: string, redirectBase: string) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola evaluasi kelayakan.")}`);
  }
  await requireModuleEnabledForAction({
    role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: MODULE_KEY,
  });
  return session;
}

export async function generateEvaluationsAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const year = Number.parseInt(formData.get("year")?.toString() ?? "", 10);
  const redirectBase = `/${companySlug}/sdm/kompetensi/kelayakan`;
  const session = await guard(companySlug, redirectBase);

  if (!Number.isInteger(year)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tahun tidak valid.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  const result = await withTenantContext(tenantContext, (tx) =>
    generateEvaluations(tx, { companyId: company.id, year, createdBy: session.user.id })
  );

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "generate_practitioner_eligibility_evaluations",
    entityType: "practitioner_eligibility_evaluation",
    // Aksi massal per tahun — entityId null karena subjeknya banyak baris
    // sekaligus, pola sama dengan refresh_overdue_invoices (AUDIT-C).
    entityId: null,
    metadata: { year, ...result },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?tahun=${year}&success=1`);
}

export async function submitForApprovalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const evaluationId = formData.get("evaluationId")?.toString() ?? "";
  const year = formData.get("year")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kompetensi/kelayakan`;
  const session = await guard(companySlug, redirectBase);

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  const { stepsCreated } = await withTenantContext(tenantContext, async (tx) => {
    const r = await submitForApproval(tx, { companyId: company.id, evaluationId });
    await syncFinalStatus(tx, { evaluationId });
    return r;
  });

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "submit_practitioner_eligibility_for_approval",
    entityType: "practitioner_eligibility_evaluation",
    entityId: evaluationId,
    metadata: { year, stepsCreated },
  });

  revalidatePath(redirectBase);
  // stepsCreated = 0 berarti company belum mengonfigurasi approval flow. Status
  // TETAP 'pending_review' (fail-closed) — user diberi tahu eksplisit supaya tidak
  // mengira evaluasi sudah beres.
  if (stepsCreated === 0) {
    redirect(`${redirectBase}?tahun=${year}&error=${encodeURIComponent(
      "Belum ada jenjang approval yang dikonfigurasi untuk evaluasi kelayakan. Status tetap Menunggu Review sampai Direktur ditetapkan di Pengaturan > Jenjang Approval."
    )}`);
  }
  redirect(`${redirectBase}?tahun=${year}&success=1`);
}

export async function decideEligibilityApprovalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const evaluationId = formData.get("evaluationId")?.toString() ?? "";
  const year = formData.get("year")?.toString() ?? "";
  const stepOrder = Number.parseInt(formData.get("stepOrder")?.toString() ?? "", 10);
  const decision = formData.get("decision")?.toString() as "approved" | "rejected";
  const catatan = formData.get("catatan")?.toString().trim() || null;
  const redirectBase = `/${companySlug}/sdm/kompetensi/kelayakan`;

  // SENGAJA tidak memakai guard() di atas: kewenangan approve TIDAK ditentukan
  // permission modul, melainkan sepenuhnya oleh approval_flows
  // (required_approver_user_id / required_role) lewat recordApprovalDecision.
  // Jadi Direktur yang bukan admin modul tetap bisa memutuskan.
  const session = await auth();
  if (!session?.user) redirect(`${redirectBase}?error=${encodeURIComponent("Sesi tidak valid.")}`);
  await requireModuleEnabledForAction({
    role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: MODULE_KEY,
  });

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  let finalStatus: string;
  try {
    finalStatus = await withTenantContext(tenantContext, async (tx) => {
      const [actingUser] = await tx.select().from(users).where(eq(users.id, session.user.id));
      await recordApprovalDecision(tx, {
        companyId: company.id,
        entityType: ELIGIBILITY_ENTITY_TYPE,
        entityId: evaluationId,
        stepOrder,
        actingUser: {
          id: session.user.id,
          role: session.user.role as Role,
          departmentId: actingUser?.departmentId ?? null,
        },
        decision,
        catatan,
      });
      return syncFinalStatus(tx, { evaluationId });
    });
  } catch (err) {
    if (err instanceof ApprovalError) {
      redirect(`${redirectBase}?tahun=${year}&error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: decision === "approved" ? "approve_practitioner_eligibility" : "reject_practitioner_eligibility",
    entityType: "practitioner_eligibility_evaluation",
    entityId: evaluationId,
    metadata: { year, stepOrder, decision, catatan, finalStatus },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?tahun=${year}&success=1`);
}

export async function updateEligibilitySettingsAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const raw = formData.get("seniorMinAssignments")?.toString().trim() ?? "";
  const redirectBase = `/${companySlug}/sdm/kompetensi/kelayakan`;
  const session = await guard(companySlug, redirectBase);

  const parsed = raw === "" ? null : Number.parseInt(raw, 10);
  if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Ambang batas senior harus bilangan bulat minimal 1.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  const [row] = await withTenantContext(tenantContext, (tx) =>
    tx
      .insert(practitionerEligibilitySettings)
      .values({ companyId: company.id, seniorMinAssignments: parsed })
      .onConflictDoUpdate({
        target: practitionerEligibilitySettings.companyId,
        set: { seniorMinAssignments: parsed, updatedAt: new Date() },
      })
      .returning()
  );

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "update_practitioner_eligibility_settings",
    entityType: "practitioner_eligibility_settings",
    entityId: row.id,
    metadata: { seniorMinAssignments: parsed },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

// Catatan: file "use server" hanya boleh meng-export fungsi async, jadi tidak ada
// re-export tabel/konstanta di sini. Halaman memanggil listEvaluations()
// langsung dari lib/hr/practitionerEligibility.ts.
