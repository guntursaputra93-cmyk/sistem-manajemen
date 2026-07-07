"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { incomingLetters, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { getNextAgendaNumber, formatAgendaNumber } from "@/lib/letters/agenda";
import { createDisposition, DispositionError } from "@/lib/letters/dispositions";

export async function createIncomingLetter(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-masuk`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_INCOMING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin registrasi surat masuk.")}`);
  }

  const letterDate = formData.get("letterDate")?.toString() ?? "";
  const receivedDate = formData.get("receivedDate")?.toString() ?? "";
  const sender = formData.get("sender")?.toString().trim() ?? "";
  const subject = formData.get("subject")?.toString().trim() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;

  if (!letterDate || !receivedDate || !sender || !subject) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal surat, tanggal diterima, pengirim, dan perihal wajib diisi.")}`);
  }

  const year = new Date(receivedDate).getFullYear();

  const letter = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
    const agendaSeq = await getNextAgendaNumber(tx, { companyId: session.user.companyId, year });
    const [row] = await tx
      .insert(incomingLetters)
      .values({
        companyId: session.user.companyId,
        agendaNumber: formatAgendaNumber(year, agendaSeq),
        letterDate,
        receivedDate,
        sender,
        subject,
        departmentId,
        createdBy: session.user.id,
      })
      .returning();
    return row;
  });

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "create_incoming_letter",
    entityType: "incoming_letter",
    entityId: letter.id,
    metadata: { agendaNumber: letter.agendaNumber, sender, subject },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function addDisposition(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const incomingLetterId = formData.get("incomingLetterId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-masuk/${incomingLetterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_DISPOSITION")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat disposisi.")}`);
  }

  const targetDepartmentId = formData.get("targetDepartmentId")?.toString() || null;
  const targetUserId = formData.get("targetUserId")?.toString() || null;
  const instruction = formData.get("instruction")?.toString().trim() || null;

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [actingUser] = await tx.select().from(users).where(eq(users.id, session.user.id));
      await createDisposition(tx, {
        companyId: session.user.companyId,
        incomingLetterId,
        fromUserId: session.user.id,
        fromUserRole: session.user.role as Role,
        fromUserDepartmentId: actingUser?.departmentId ?? null,
        targetDepartmentId,
        targetUserId,
        instruction,
      });
    });
  } catch (err) {
    if (err instanceof DispositionError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    action: "create_disposition",
    entityType: "incoming_letter",
    entityId: incomingLetterId,
    metadata: { targetDepartmentId, targetUserId, instruction },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

