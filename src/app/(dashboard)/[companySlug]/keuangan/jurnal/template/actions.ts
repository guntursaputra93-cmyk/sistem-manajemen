"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { journalTemplates, journalTemplateLines, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function createJournalTemplate(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/template`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() || null;
  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama template wajib diisi.")}`);
  }

  let created: typeof journalTemplates.$inferSelect;
  try {
    [created] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(journalTemplates).values({ companyId, name, description, createdBy: session.user.id }).returning()
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Sudah ada template dengan nama ini.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_journal_template",
    entityType: "journal_template",
    entityId: created.id,
    metadata: { name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${created.id}?success=1`);
}

export async function updateJournalTemplate(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/template/${templateId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() || null;
  const isActive = formData.get("isActive")?.toString() === "true";
  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama template wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx
        .update(journalTemplates)
        .set({ name, description, isActive, updatedAt: new Date() })
        .where(and(eq(journalTemplates.id, templateId), eq(journalTemplates.companyId, companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Sudah ada template dengan nama ini.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_journal_template",
    entityType: "journal_template",
    entityId: templateId,
    metadata: { name, isActive },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteJournalTemplate(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const listBase = `/${companySlug}/keuangan/jurnal/template`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${listBase}/${templateId}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  // Baris template ikut terhapus lewat cascade FK. Jurnal yang sudah dibuat dari
  // template ini TIDAK terpengaruh — barisnya sudah disalin ke journal_entry_lines
  // sendiri; journal_entries.source_id cuma penanda (tanpa FK), boleh menggantung.
  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.delete(journalTemplates).where(and(eq(journalTemplates.id, templateId), eq(journalTemplates.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_journal_template",
    entityType: "journal_template",
    entityId: templateId,
  });

  revalidatePath(listBase);
  redirect(`${listBase}?success=1`);
}

export async function addJournalTemplateLine(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/template/${templateId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const accountId = formData.get("accountId")?.toString() ?? "";
  const side = formData.get("side")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() || null;

  if (!accountId || (side !== "debit" && side !== "kredit")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun dan sisi (debit/kredit) wajib dipilih.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
      const [template] = await tx
        .select()
        .from(journalTemplates)
        .where(and(eq(journalTemplates.id, templateId), eq(journalTemplates.companyId, companyId)));
      if (!template) throw new Error("TEMPLATE_NOT_FOUND");

      // Validasi is_header=false app-level (dropdown UI sudah difilter, ini jaga
      // kalau request dibuat manual di luar form) — sama pola addJournalLine.
      const [account] = await tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
      if (!account || account.isHeader) throw new Error("ACCOUNT_NOT_POSTING");

      const existing = await tx.select().from(journalTemplateLines).where(eq(journalTemplateLines.templateId, templateId));

      await tx.insert(journalTemplateLines).values({
        companyId,
        templateId,
        accountId,
        side: side as "debit" | "kredit",
        lineOrder: existing.length + 1,
        description,
      });
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message === "ACCOUNT_NOT_POSTING"
        ? "Akun yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai."
        : "Template tidak ditemukan.";
    redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "add_journal_template_line",
    entityType: "journal_template",
    entityId: templateId,
    metadata: { accountId, side },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateJournalTemplateLine(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const lineId = formData.get("lineId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/template/${templateId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const accountId = formData.get("accountId")?.toString() ?? "";
  const side = formData.get("side")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() || null;

  if (!accountId || (side !== "debit" && side !== "kredit")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun dan sisi (debit/kredit) wajib dipilih.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
      // Validasi akun posting (is_header=false) app-level — sama pola addJournalTemplateLine.
      const [account] = await tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
      if (!account || account.isHeader) throw new Error("ACCOUNT_NOT_POSTING");

      await tx
        .update(journalTemplateLines)
        .set({ accountId, side: side as "debit" | "kredit", description })
        .where(and(eq(journalTemplateLines.id, lineId), eq(journalTemplateLines.templateId, templateId), eq(journalTemplateLines.companyId, companyId)));
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message === "ACCOUNT_NOT_POSTING"
        ? "Akun yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dipakai."
        : "Gagal memperbarui baris template.";
    redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_journal_template_line",
    entityType: "journal_template",
    entityId: templateId,
    metadata: { lineId, accountId, side },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteJournalTemplateLine(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const lineId = formData.get("lineId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/template/${templateId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengelola template jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .delete(journalTemplateLines)
      .where(and(eq(journalTemplateLines.id, lineId), eq(journalTemplateLines.templateId, templateId), eq(journalTemplateLines.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_journal_template_line",
    entityType: "journal_template",
    entityId: templateId,
    metadata: { lineId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
