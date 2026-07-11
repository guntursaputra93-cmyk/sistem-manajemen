"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { cpdActivities } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { uploadAttachment, AttachmentValidationError } from "@/lib/storage/attachments";

const CATEGORIES = ["internal", "eksternal"] as const;

/**
 * Sama seperti createCpdActivity di ../cpd/actions.ts, TAPI employeeId diambil dari
 * akun yang login (bukan dipilih dari dropdown) — self-service selalu catat milik
 * sendiri, tidak bisa catat untuk karyawan lain lewat halaman ini.
 */
export async function createCpdActivitySelf(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/cpd-saya`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_CPD_ACTIVITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat aktivitas CPD.")}`);
  }

  const activityName = formData.get("activityName")?.toString().trim() ?? "";
  const categoryRaw = formData.get("category")?.toString() ?? "";
  const organizer = formData.get("organizer")?.toString().trim() || null;
  const durationHours = formData.get("durationHours")?.toString() ?? "";
  const activityDate = formData.get("activityDate")?.toString() || null;
  const year = Number(formData.get("year"));
  const attachmentFile = formData.get("attachmentFile");

  if (!activityName || !CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]) || !durationHours || !Number.isFinite(year)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama aktivitas, kategori, durasi jam, dan tahun wajib diisi.")}`);
  }
  // Validasi server WAJIB — jangan cuma andalkan `required` di client.
  if (!(attachmentFile instanceof File) || attachmentFile.size === 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Bukti aktivitas (PDF) wajib diunggah — aktivitas tanpa bukti tidak dapat dicatat.")}`);
  }
  const category = categoryRaw as (typeof CATEGORIES)[number];

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId, userId: session.user.id }));
  if (!employee) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun Anda belum terhubung ke data karyawan — hubungi admin.")}`);
  }

  // id di-generate duluan — lihat komentar di ../cpd/actions.ts (attachmentId
  // NOT NULL, jadi attachments.entityId harus sudah ada sebelum insert cpd_activities).
  const activityId = randomUUID();

  let activity;
  try {
    activity = await withTenantContext(tenantContext, async (tx) => {
      const uploaded = await uploadAttachment(tx, {
        file: attachmentFile,
        companyId,
        entityType: "cpd_activity",
        entityId: activityId,
        uploadedBy: session.user.id,
      });
      const [inserted] = await tx
        .insert(cpdActivities)
        .values({ id: activityId, companyId, employeeId: employee.id, activityName, category, organizer, durationHours, activityDate, year, attachmentId: uploaded.id, createdBy: session.user.id })
        .returning();
      return inserted;
    });
  } catch (err) {
    if (err instanceof AttachmentValidationError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_cpd_activity",
    entityType: "cpd_activity",
    entityId: activity.id,
    metadata: { employeeId: employee.id, activityName, durationHours, year },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
