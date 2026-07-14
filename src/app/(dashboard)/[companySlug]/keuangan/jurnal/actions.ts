"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { journalEntries, journalEntryLines, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { postJournalEntry, voidJournalEntry, JournalError } from "@/lib/finance/journal";

export async function createJournalEntry(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat jurnal.")}`);
  }

  const entryDate = formData.get("entryDate")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";

  if (!entryDate || !description) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal dan keterangan wajib diisi.")}`);
  }

  const [entry] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(journalEntries).values({ companyId, entryDate, description, createdBy: session.user.id }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_journal_entry",
    entityType: "journal_entry",
    entityId: entry.id,
    metadata: { entryDate, description },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${entry.id}?success=1`);
}

export async function updateJournalEntryHeader(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah jurnal.")}`);
  }

  const entryDate = formData.get("entryDate")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!entryDate || !description) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tanggal dan keterangan wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [updated] = await withTenantContext(tenantContext, (tx) =>
    tx
      .update(journalEntries)
      .set({ entryDate, description })
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId), eq(journalEntries.status, "draft")))
      .returning()
  );
  if (!updated) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jurnal ini sudah tidak berstatus draft — tidak bisa diubah.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_journal_entry",
    entityType: "journal_entry",
    entityId: journalEntryId,
    metadata: { entryDate, description },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteJournalEntry(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menghapus jurnal.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  // where status='draft' langsung di query (bukan cek lalu hapus terpisah) — jurnal
  // posted/void TIDAK PERNAH dihapus (Fase 3: "posted tidak bisa diedit, hanya void +
  // jurnal koreksi baru"), baris menghilang tanpa efek kalau precondition tidak cocok.
  const [deleted] = await withTenantContext(tenantContext, (tx) =>
    tx
      .delete(journalEntries)
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId), eq(journalEntries.status, "draft")))
      .returning()
  );
  if (!deleted) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jurnal ini sudah tidak berstatus draft — tidak bisa dihapus, void saja.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_journal_entry",
    entityType: "journal_entry",
    entityId: journalEntryId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function addJournalLine(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah jurnal.")}`);
  }

  const accountId = formData.get("accountId")?.toString() ?? "";
  const debitAmount = (formData.get("debitAmount")?.toString().trim() || "0").replace(",", ".");
  const creditAmount = (formData.get("creditAmount")?.toString().trim() || "0").replace(",", ".");
  const description = formData.get("description")?.toString().trim() || null;

  const debit = Number(debitAmount);
  const credit = Number(creditAmount);
  if (!accountId || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun dan nominal wajib diisi dengan benar.")}`);
  }
  if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Isi salah satu saja — debit ATAU kredit, tidak boleh dua-duanya atau kosong dua-duanya.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [entry] = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)));
      if (!entry || entry.status !== "draft") throw new JournalError("Jurnal ini sudah tidak berstatus draft.");

      // Validasi is_header=false di level aplikasi (Fase 3 Langkah 2) — dropdown UI
      // sudah difilter, ini menjaga kalau request dibuat manual di luar form.
      const [account] = await tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
      if (!account || account.isHeader) {
        throw new JournalError("Akun yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dijurnal.");
      }

      const existingLines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, journalEntryId));

      await tx.insert(journalEntryLines).values({
        companyId,
        journalEntryId,
        accountId,
        lineOrder: existingLines.length + 1,
        debitAmount: debit.toFixed(2),
        creditAmount: credit.toFixed(2),
        description,
      });
    });
  } catch (err) {
    if (err instanceof JournalError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "add_journal_line",
    entityType: "journal_entry",
    entityId: journalEntryId,
    metadata: { accountId, debit, credit },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteJournalLine(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const lineId = formData.get("lineId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah jurnal.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [entry] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(journalEntries).where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)))
  );
  if (!entry || entry.status !== "draft") {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jurnal ini sudah tidak berstatus draft — baris tidak bisa dihapus.")}`);
  }

  await withTenantContext(tenantContext, (tx) =>
    tx.delete(journalEntryLines).where(and(eq(journalEntryLines.id, lineId), eq(journalEntryLines.journalEntryId, journalEntryId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_journal_line",
    entityType: "journal_entry",
    entityId: journalEntryId,
    metadata: { lineId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function postJournalEntryAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin memposting jurnal.")}`);
  }

  let result;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      postJournalEntry(tx, { companyId, journalEntryId, postedBy: session.user.id })
    );
  } catch (err) {
    if (err instanceof JournalError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "post_journal_entry",
    entityType: "journal_entry",
    entityId: journalEntryId,
    metadata: { entryNumber: result.entryNumber },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function voidJournalEntryAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membatalkan jurnal.")}`);
  }

  const voidReason = formData.get("voidReason")?.toString().trim() ?? "";
  if (!voidReason) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Alasan pembatalan wajib diisi.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      voidJournalEntry(tx, { companyId, journalEntryId, voidedBy: session.user.id, voidReason })
    );
  } catch (err) {
    if (err instanceof JournalError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "void_journal_entry",
    entityType: "journal_entry",
    entityId: journalEntryId,
    metadata: { voidReason },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createCorrectionEntry(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const sourceEntryId = formData.get("sourceEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${sourceEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat jurnal koreksi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  let correction: typeof journalEntries.$inferSelect;
  try {
    correction = await withTenantContext(tenantContext, async (tx) => {
      const [source] = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, sourceEntryId), eq(journalEntries.companyId, companyId)));
      if (!source || source.status !== "void") {
        throw new JournalError("Jurnal koreksi hanya bisa dibuat dari jurnal yang sudah di-void.");
      }
      const [created] = await tx
        .insert(journalEntries)
        .values({
          companyId,
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Koreksi atas ${source.entryNumber ?? source.id}`,
          correctsEntryId: source.id,
          createdBy: session.user.id,
        })
        .returning();
      return created;
    });
  } catch (err) {
    if (err instanceof JournalError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_journal_correction",
    entityType: "journal_entry",
    entityId: correction.id,
    metadata: { correctsEntryId: sourceEntryId },
  });

  revalidatePath(redirectBase);
  redirect(`/${companySlug}/keuangan/jurnal/${correction.id}?success=1`);
}
