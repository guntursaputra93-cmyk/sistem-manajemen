"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { calibrationMeetings, calibrationAttendees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

export async function createCalibrationMeeting(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kalibrasi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat notulen kalibrasi.")}`);
  }

  const meetingDate = formData.get("meetingDate")?.toString() || "";
  const locationOrMedia = formData.get("locationOrMedia")?.toString().trim() || null;
  const leaderUserId = formData.get("leaderUserId")?.toString() ?? "";
  const notetakerUserId = formData.get("notetakerUserId")?.toString() || null;
  const agenda = formData.get("agenda")?.toString().trim() || null;

  if (!meetingDate || !leaderUserId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal rapat dan pemimpin rapat wajib diisi.")}`);
  }

  const [meeting] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(calibrationMeetings).values({ companyId, meetingDate, locationOrMedia, leaderUserId, notetakerUserId, agenda, createdBy: session.user.id }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_calibration_meeting",
    entityType: "calibration_meeting",
    entityId: meeting.id,
    metadata: { meetingDate, leaderUserId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${meeting.id}?success=1`);
}

export async function updateCalibrationMeeting(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const meetingId = formData.get("meetingId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kalibrasi/${meetingId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah notulen kalibrasi.")}`);
  }

  const meetingDate = formData.get("meetingDate")?.toString() || "";
  const locationOrMedia = formData.get("locationOrMedia")?.toString().trim() || null;
  const leaderUserId = formData.get("leaderUserId")?.toString() ?? "";
  const notetakerUserId = formData.get("notetakerUserId")?.toString() || null;
  const agenda = formData.get("agenda")?.toString().trim() || null;
  const discussionNotes = formData.get("discussionNotes")?.toString().trim() || null;

  if (!meetingDate || !leaderUserId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal rapat dan pemimpin rapat wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(calibrationMeetings)
      .set({ meetingDate, locationOrMedia, leaderUserId, notetakerUserId, agenda, discussionNotes })
      .where(and(eq(calibrationMeetings.id, meetingId), eq(calibrationMeetings.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_calibration_meeting",
    entityType: "calibration_meeting",
    entityId: meetingId,
    metadata: { meetingDate },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function addAttendee(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const meetingId = formData.get("meetingId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/sdm/kalibrasi/${meetingId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah peserta.")}`);
  }

  const employeeId = formData.get("employeeId")?.toString() || null;
  const attendeeName = formData.get("attendeeName")?.toString().trim() || null;
  const attendeeRole = formData.get("attendeeRole")?.toString().trim() || null;

  if (!employeeId && !attendeeName) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Pilih karyawan atau isi nama peserta manual.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(calibrationAttendees).values({ companyId, meetingId, employeeId, attendeeName, attendeeRole })
  );

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function toggleAttendeeSigned(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const meetingId = formData.get("meetingId")?.toString() ?? "";
  const attendeeId = formData.get("attendeeId")?.toString() ?? "";
  const nextSigned = formData.get("nextSigned")?.toString() === "true";
  const redirectBase = `/${companySlug}/sdm/kalibrasi/${meetingId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah status tanda tangan.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(calibrationAttendees)
      .set({ signed: nextSigned })
      .where(and(eq(calibrationAttendees.id, attendeeId), eq(calibrationAttendees.companyId, companyId)))
  );

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
