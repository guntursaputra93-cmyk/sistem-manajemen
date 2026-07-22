import { and, asc, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { journalTemplates, journalTemplateLines, journalEntries, journalEntryLines, chartOfAccounts } from "@/drizzle/schema";
import { postJournalEntry } from "./journal";
import { openOpenItem, openItemTriggerSide, normalizeOpenItemType, type OpenItemType } from "./openItems";

export class TemplateError extends Error {}

/**
 * Inti "jurnal cepat" (Item C). Dari satu template + nominal per baris yang diisi
 * staf, buat header jurnal draft + baris debit/kredit, LALU langsung posting —
 * semuanya dalam SATU transaksi (dipanggil di dalam withTenantContext). Kalau
 * posting gagal (tidak balance / kurang baris / akun header), seluruh transaksi
 * di-rollback jadi tidak ada jurnal setengah jadi yang mengendap. Ini tujuan
 * utamanya: mengurangi jurnal "terbuka" (draft) yang rawan salah/lupa diselesaikan.
 *
 * amountByLineId: nominal per journal_template_lines.id. Baris dengan nominal
 * <= 0 DILEWATI (tidak dijurnalkan) supaya template boleh punya baris opsional;
 * validasi minimal 2 baris terisi + balance ditegakkan postJournalEntry (gate
 * yang sama persis dengan jurnal manual — tidak ada jalur validasi kedua).
 */
export async function createQuickJournalFromTemplate(
  tx: typeof Db,
  params: {
    companyId: string;
    templateId: string;
    entryDate: string;
    description: string;
    amountByLineId: Map<string, number>;
    // Detail transaksi terbuka per journal_template_lines.id — WAJIB untuk baris debit
    // yang akunnya ber-flag is_open_item (deteksi otomatis, Item 3). Baris lain diabaikan.
    openItemByLineId?: Map<string, { description: string; dueDate: string | null }>;
    // Rekanan per baris template (Item 5b) — dipakai untuk dimensi rekanan di baris
    // jurnal SEKALIGUS sebagai rekanan transaksi terbuka yang dibuka baris itu.
    organizationByLineId?: Map<string, string | null>;
    userId: string;
  }
): Promise<{ journalEntryId: string; entryNumber: string }> {
  const [tpl] = await tx
    .select()
    .from(journalTemplates)
    .where(and(eq(journalTemplates.id, params.templateId), eq(journalTemplates.companyId, params.companyId)));
  if (!tpl) throw new TemplateError("Template tidak ditemukan.");
  if (!tpl.isActive) throw new TemplateError("Template ini nonaktif — tidak bisa dipakai.");

  const tplLines = await tx
    .select()
    .from(journalTemplateLines)
    .where(eq(journalTemplateLines.templateId, tpl.id))
    .orderBy(asc(journalTemplateLines.lineOrder));
  if (tplLines.length < 2) throw new TemplateError("Template harus punya minimal 2 baris sebelum bisa dipakai.");

  const accountIds = [...new Set(tplLines.map((l) => l.accountId))];
  const accounts = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, params.companyId), inArray(chartOfAccounts.id, accountIds)));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: params.entryDate,
      description: params.description,
      createdBy: params.userId,
      sourceType: "template",
      sourceId: params.templateId,
    })
    .returning();

  let order = 0;
  const rows: (typeof journalEntryLines.$inferInsert)[] = [];
  // Baris yang memakai akun ber-flag DI SISI PEMICUNYA → dibuka setelah posting.
  // Sisi pemicu diturunkan dari jenis (uang muka = debet, DP diterima = kredit).
  const openers: { accountId: string; amount: number; type: OpenItemType; code: string; lineId: string }[] = [];
  for (const tl of tplLines) {
    const amount = params.amountByLineId.get(tl.id) ?? 0;
    if (!(amount > 0)) continue;
    const acc = accountById.get(tl.accountId);
    if (!acc || acc.isHeader) {
      throw new TemplateError("Salah satu baris template menunjuk akun header (grup) — hanya akun posting yang boleh dijurnal.");
    }
    order += 1;
    rows.push({
      companyId: params.companyId,
      journalEntryId: entry.id,
      accountId: tl.accountId,
      lineOrder: order,
      debitAmount: tl.side === "debit" ? amount.toFixed(2) : "0",
      creditAmount: tl.side === "kredit" ? amount.toFixed(2) : "0",
      description: tl.description ?? null,
      organizationId: params.organizationByLineId?.get(tl.id) ?? null,
    });
    if (acc.isOpenItem && tl.side === openItemTriggerSide(acc.openItemType)) {
      openers.push({ accountId: acc.id, amount, type: normalizeOpenItemType(acc.openItemType), code: acc.code, lineId: tl.id });
    }
  }
  if (rows.length < 2) throw new TemplateError("Isi minimal 2 baris dengan nominal lebih dari 0.");

  // Validasi baris akun terbuka SEBELUM posting (fail fast). Cukup salah satu:
  // keterangan bebas ATAU rekanan (openOpenItem memakai nama rekanan sebagai
  // keterangan bila keterangannya dikosongkan).
  for (const o of openers) {
    const detail = params.openItemByLineId?.get(o.lineId);
    const org = params.organizationByLineId?.get(o.lineId) ?? null;
    if (!detail?.description.trim() && !org) {
      throw new TemplateError(`Akun ${o.code} adalah akun transaksi terbuka — isi Pihak/keterangan atau pilih Rekanan pada barisnya.`);
    }
  }

  await tx.insert(journalEntryLines).values(rows);

  const { entryNumber } = await postJournalEntry(tx, {
    companyId: params.companyId,
    journalEntryId: entry.id,
    postedBy: params.userId,
  });

  for (const o of openers) {
    const detail = params.openItemByLineId?.get(o.lineId);
    await openOpenItem(tx, {
      companyId: params.companyId,
      type: o.type,
      controlAccountId: o.accountId,
      description: detail?.description.trim() ?? "",
      organizationId: params.organizationByLineId?.get(o.lineId) ?? null,
      openingEntryId: entry.id,
      openingAmount: o.amount,
      dueDate: detail?.dueDate ?? null,
      userId: params.userId,
    });
  }

  return { journalEntryId: entry.id, entryNumber };
}
