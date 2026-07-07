"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { outgoingLetters, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import {
  submitForApproval,
  decideOutgoingLetterApproval,
  markOutgoingLetterAsSent,
  OutgoingLetterError,
} from "@/lib/letters/outgoing";

const CATEGORY_VALUES = ["surat_keluar", "nota_dinas"] as const;

export async function createOutgoingLetter(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat surat.")}`);
  }

  const letterCategory = formData.get("letterCategory")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() ?? "";
  const jenisKey = formData.get("jenisKey")?.toString().trim() ?? "";
  const recipient = formData.get("recipient")?.toString().trim() || null;
  const recipientDepartmentId = formData.get("recipientDepartmentId")?.toString() || null;
  const recipientUserId = formData.get("recipientUserId")?.toString() || null;
  const subject = formData.get("subject")?.toString().trim() ?? "";
  const bodyContent = formData.get("bodyContent")?.toString() || null;

  if (!CATEGORY_VALUES.includes(letterCategory as (typeof CATEGORY_VALUES)[number])) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kategori surat tidak valid.")}`);
  }
  if (!departmentId || !jenisKey || !subject) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Departemen, jenis, dan perihal wajib diisi.")}`);
  }
  if (letterCategory === "surat_keluar" && !recipient) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tujuan (penerima eksternal) wajib diisi untuk surat keluar.")}`);
  }
  if (letterCategory === "nota_dinas" && !recipientDepartmentId && !recipientUserId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tujuan internal (departemen atau orang) wajib diisi untuk nota dinas.")}`);
  }

  let letterId: string;
  try {
    const letter = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx
        .insert(outgoingLetters)
        .values({
          companyId: session.user.companyId,
          departmentId,
          letterCategory: letterCategory as (typeof CATEGORY_VALUES)[number],
          jenisKey,
          recipient: letterCategory === "surat_keluar" ? recipient : null,
          recipientDepartmentId: letterCategory === "nota_dinas" ? recipientDepartmentId : null,
          recipientUserId: letterCategory === "nota_dinas" ? recipientUserId : null,
          subject,
          bodyContent,
          createdBy: session.user.id,
        })
        .returning()
    );
    letterId = letter[0].id;
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Gagal menyimpan draft surat.")}`);
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "create_outgoing_letter_draft",
    entityType: letterCategory,
    entityId: letterId,
    metadata: { jenisKey, subject },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${letterId}?success=1`);
}

export async function submitForApprovalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const letterId = formData.get("letterId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar/${letterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengajukan approval.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      submitForApproval(tx, { companyId: session.user.companyId, letterId })
    );
  } catch (err) {
    if (err instanceof OutgoingLetterError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "submit_outgoing_letter_for_approval",
    entityType: "outgoing_letter",
    entityId: letterId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const letterId = formData.get("letterId")?.toString() ?? "";
  const stepOrder = Number.parseInt(formData.get("stepOrder")?.toString() ?? "", 10);
  const decision = formData.get("decision")?.toString() as "approved" | "rejected";
  const catatan = formData.get("catatan")?.toString().trim() || null;
  const redirectBase = `/${companySlug}/surat-keluar/${letterId}`;

  const session = await auth();
  if (!session?.user) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Sesi tidak valid.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [actingUser] = await tx.select().from(users).where(eq(users.id, session.user.id));
      await decideOutgoingLetterApproval(tx, {
        companyId: session.user.companyId,
        letterId,
        stepOrder,
        actingUser: { id: session.user.id, role: session.user.role as Role, departmentId: actingUser?.departmentId ?? null },
        decision,
        catatan,
      });
    });
  } catch (err) {
    if (err instanceof Error) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: decision === "approved" ? "approve_outgoing_letter_step" : "reject_outgoing_letter_step",
    entityType: "outgoing_letter",
    entityId: letterId,
    metadata: { stepOrder, catatan },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function markSentAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const letterId = formData.get("letterId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar/${letterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MARK_OUTGOING_LETTER_SENT")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menandai terkirim.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      markOutgoingLetterAsSent(tx, { letterId })
    );
  } catch (err) {
    if (err instanceof OutgoingLetterError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "mark_outgoing_letter_sent",
    entityType: "outgoing_letter",
    entityId: letterId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
