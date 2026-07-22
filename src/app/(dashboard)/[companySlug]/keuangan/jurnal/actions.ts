"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { createAndPostJournal, voidJournalEntry, JournalError, type NewJournalLine } from "@/lib/finance/journal";
import { openOpenItem, settleOpenItem, OpenItemError, openItemTriggerSide, normalizeOpenItemType } from "@/lib/finance/openItems";

// Parsing nominal ber-format id-ID (titik = ribuan, koma = desimal) — sama persis
// dengan QuickJournalForm/createQuickJournal supaya perilaku input konsisten.
function parseAmount(v: string): number {
  const raw = v.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Jurnal manual ATOMIK (pengganti alur draft lama): header + semua baris + posting
 * dalam satu aksi. Opsional sekaligus membuka "transaksi terbuka" (uang muka / DP).
 * Juga dipakai untuk jurnal koreksi (correctsEntryId dari jurnal yang sudah di-void).
 * Tidak ada jurnal draft yang tersimpan — gagal ⇒ rollback total.
 */
export async function createManualJournal(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const correctsEntryId = formData.get("correctsEntryId")?.toString() || null;
  const backBase = `/${companySlug}/keuangan/jurnal/baru${correctsEntryId ? `?corrects=${correctsEntryId}` : ""}`;
  const sep = correctsEntryId ? "&" : "?";

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${backBase}${sep}error=${encodeURIComponent("Tidak punya izin membuat jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const entryDate = formData.get("entryDate")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!entryDate || !description) {
    redirect(`${backBase}${sep}error=${encodeURIComponent("Tanggal dan keterangan wajib diisi.")}`);
  }

  // Baris disubmit sebagai array paralel per kolom (urutan DOM sama) — indeks ke-i
  // di tiap array pasti pasangan yang benar. lineOpenItemDesc/Due diisi HANYA untuk
  // baris yang mendebet akun ber-flag "transaksi terbuka" (deteksi otomatis).
  const accountIds = formData.getAll("lineAccountId").map((v) => v.toString());
  const debits = formData.getAll("lineDebit").map((v) => v.toString());
  const credits = formData.getAll("lineCredit").map((v) => v.toString());
  const oiDescs = formData.getAll("lineOpenItemDesc").map((v) => v.toString());
  const oiDues = formData.getAll("lineOpenItemDue").map((v) => v.toString());
  // Rekanan per baris (Item 5b) — berlaku untuk SEMUA baris, bukan hanya baris
  // transaksi terbuka: inilah yang memungkinkan penelusuran biaya/hutang/piutang
  // per rekanan langsung dari baris jurnal.
  const lineOrgs = formData.getAll("lineOrg").map((v) => v.toString());

  type Row = { accountId: string; debit: number; credit: number; oiDesc: string; oiDue: string | null; org: string | null };
  const rows: Row[] = accountIds
    .map((accountId, i) => ({
      accountId,
      debit: parseAmount(debits[i] ?? ""),
      credit: parseAmount(credits[i] ?? ""),
      oiDesc: (oiDescs[i] ?? "").trim(),
      oiDue: (oiDues[i] ?? "").trim() || null,
      org: (lineOrgs[i] ?? "").trim() || null,
    }))
    .filter((r) => r.accountId && (r.debit > 0 || r.credit > 0));
  const lines: NewJournalLine[] = rows.map((r) => ({
    accountId: r.accountId,
    debit: r.debit,
    credit: r.credit,
    organizationId: r.org,
  }));

  let result: { journalEntryId: string; entryNumber: string };
  let openItemCount = 0;
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, async (tx) => {
      // Akun ber-flag "transaksi terbuka" (deteksi otomatis, hanya sisi debet — Item 3).
      const usedIds = [...new Set(rows.map((r) => r.accountId))];
      const accs = usedIds.length
        ? await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), inArray(chartOfAccounts.id, usedIds)))
        : [];
      const flagged = new Map(accs.filter((a) => a.isOpenItem).map((a) => [a.id, a]));

      // Baris yang memakai akun ber-flag DI SISI PEMICUNYA wajib isi Pihak/Rekanan —
      // inilah pengganti checkbox lama: user tidak bisa lupa karena dipicu oleh pilihan
      // akun + wajib. Sisi pemicu diturunkan dari jenis (uang muka = debet, DP = kredit).
      const openingRows = rows.filter((r) => {
        const acc = flagged.get(r.accountId);
        if (!acc) return false;
        return openItemTriggerSide(acc.openItemType) === "debit" ? r.debit > 0 : r.credit > 0;
      });
      for (const r of openingRows) {
        // Cukup salah satu: keterangan bebas ATAU rekanan (openOpenItem memakai nama
        // rekanan sebagai keterangan bila keterangannya dikosongkan).
        if (!r.oiDesc && !r.org) {
          throw new OpenItemError(`Akun ${flagged.get(r.accountId)!.code} adalah akun transaksi terbuka — isi Pihak/keterangan atau pilih Rekanan pada barisnya.`);
        }
      }

      const posted = await createAndPostJournal(tx, {
        companyId,
        entryDate,
        description,
        userId: session.user.id,
        lines,
        correctsEntryId,
      });

      for (const r of openingRows) {
        const acc = flagged.get(r.accountId)!;
        await openOpenItem(tx, {
          companyId,
          type: normalizeOpenItemType(acc.openItemType),
          controlAccountId: r.accountId,
          description: r.oiDesc,
          organizationId: r.org,
          openingEntryId: posted.journalEntryId,
          // Nilai pembuka diambil dari sisi pemicunya (DP dibuka dari sisi kredit).
          openingAmount: r.debit > 0 ? r.debit : r.credit,
          dueDate: r.oiDue,
          userId: session.user.id,
        });
      }
      openItemCount = openingRows.length;
      return posted;
    });
  } catch (err) {
    if (err instanceof JournalError || err instanceof OpenItemError) {
      redirect(`${backBase}${sep}error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: correctsEntryId ? "create_journal_correction" : "create_manual_journal",
    entityType: "journal_entry",
    entityId: result.journalEntryId,
    metadata: { entryNumber: result.entryNumber, correctsEntryId, openItemCount },
  });

  revalidatePath(`/${companySlug}/keuangan/jurnal`);
  redirect(`/${companySlug}/keuangan/jurnal/${result.journalEntryId}?success=1`);
}

/** Void jurnal posted — satu-satunya cara membatalkan (lalu buat jurnal koreksi baru). */
export async function voidJournalEntryAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const journalEntryId = formData.get("journalEntryId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/jurnal/${journalEntryId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membatalkan jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

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

/**
 * Selesaikan transaksi terbuka (sebagian/penuh): membuat jurnal penyelesaian atomik
 * yang membersihkan akun kontrol + baris lawan yang diisi user, lalu memperbarui
 * status item. Gagal ⇒ rollback (tidak ada jurnal/penautan tersisa).
 */
export async function settleOpenItemAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const openItemId = formData.get("openItemId")?.toString() ?? "";
  const backBase = `/${companySlug}/keuangan/jurnal/transaksi-terbuka/${openItemId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${backBase}?error=${encodeURIComponent("Tidak punya izin menyelesaikan transaksi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const entryDate = formData.get("entryDate")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!entryDate || !description) {
    redirect(`${backBase}?error=${encodeURIComponent("Tanggal dan keterangan wajib diisi.")}`);
  }

  const accountIds = formData.getAll("counterAccountId").map((v) => v.toString());
  const amounts = formData.getAll("counterAmount").map((v) => v.toString());
  const counterLines = accountIds
    .map((accountId, i) => ({ accountId, amount: parseAmount(amounts[i] ?? "") }))
    .filter((l) => l.accountId && l.amount > 0);

  let result: { journalEntryId: string; entryNumber: string };
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      settleOpenItem(tx, { companyId, openItemId, entryDate, description, counterLines, userId: session.user.id })
    );
  } catch (err) {
    if (err instanceof JournalError || err instanceof OpenItemError) {
      redirect(`${backBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "settle_open_item",
    entityType: "open_item",
    entityId: openItemId,
    metadata: { entryNumber: result.entryNumber },
  });

  revalidatePath(`/${companySlug}/keuangan/jurnal`);
  redirect(`/${companySlug}/keuangan/jurnal/${result.journalEntryId}?success=1`);
}
