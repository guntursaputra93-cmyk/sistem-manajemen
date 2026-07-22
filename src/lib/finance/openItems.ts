import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { openItems, openItemSettlements, chartOfAccounts, organizations } from "@/drizzle/schema";
import { createAndPostJournal, type NewJournalLine } from "./journal";

export class OpenItemError extends Error {}

export type OpenItemType = "uang_muka" | "dp_diterima" | "lainnya";

/**
 * Normalisasi nilai chart_of_accounts.open_item_type (disimpan text) ke union yang valid.
 */
export function normalizeOpenItemType(raw: string | null | undefined): OpenItemType {
  return raw === "dp_diterima" ? "dp_diterima" : raw === "lainnya" ? "lainnya" : "uang_muka";
}

/**
 * SATU sumber kebenaran untuk arah pemicu transaksi terbuka — diturunkan dari jenisnya,
 * bukan disimpan terpisah, supaya tidak mungkin ada kombinasi mustahil (mis. uang muka
 * yang dipicu saat dikredit):
 *   - uang_muka / lainnya → aset, terbuka saat akun DIDEBET
 *   - dp_diterima        → kewajiban, terbuka saat akun DIKREDIT
 * Sisi penyelesaiannya otomatis berlawanan (lihat settleOpenItem, yang menurunkannya
 * dari saldo normal akun kontrol).
 */
export function openItemTriggerSide(rawType: string | null | undefined): "debit" | "kredit" {
  return normalizeOpenItemType(rawType) === "dp_diterima" ? "kredit" : "debit";
}

const EPS = 0.005; // toleransi pembulatan numeric(15,2)

/**
 * Daftarkan sebuah transaksi terbuka di atas jurnal PEMBUKA yang sudah diposting.
 * Dipanggil di dalam transaksi yang sama dengan pembuatan jurnal pembuka (lihat
 * createManualJournal) supaya pembuka + pendaftaran item atomik.
 *
 * openingAmount = nilai yang menyentuh akun kontrol di jurnal pembuka (sisi mana pun).
 */
export async function openOpenItem(
  tx: typeof Db,
  params: {
    companyId: string;
    type: "uang_muka" | "dp_diterima" | "lainnya";
    controlAccountId: string;
    description: string;
    // Tautan opsional ke rekanan/klien CRM (Item 5a) untuk penelusuran per rekanan.
    organizationId?: string | null;
    openingEntryId: string;
    openingAmount: number;
    dueDate?: string | null;
    userId: string;
  }
): Promise<string> {
  const [control] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, params.controlAccountId), eq(chartOfAccounts.companyId, params.companyId)));
  if (!control || control.isHeader) {
    throw new OpenItemError("Akun kontrol harus akun posting yang valid (bukan akun header).");
  }
  if (!(params.openingAmount > 0)) {
    throw new OpenItemError("Nilai transaksi terbuka harus lebih dari 0.");
  }

  // Cukup isi SALAH SATU: keterangan bebas ATAU rekanan. Kalau hanya rekanan yang
  // dipilih, nama rekanan dipakai sebagai keterangan (kolom description NOT NULL)
  // — supaya user tidak perlu mengetik ulang pihak yang sudah dipilih di dropdown.
  let description = params.description.trim();
  if (!description) {
    if (!params.organizationId) {
      throw new OpenItemError("Isi Pihak/keterangan atau pilih Rekanan untuk transaksi terbuka ini.");
    }
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.id, params.organizationId), eq(organizations.companyId, params.companyId)));
    if (!org) throw new OpenItemError("Rekanan yang dipilih tidak ditemukan.");
    description = org.name;
  }

  const [row] = await tx
    .insert(openItems)
    .values({
      companyId: params.companyId,
      type: params.type,
      controlAccountId: params.controlAccountId,
      description,
      organizationId: params.organizationId ?? null,
      openingEntryId: params.openingEntryId,
      openingAmount: params.openingAmount.toFixed(2),
      dueDate: params.dueDate ?? null,
      createdBy: params.userId,
    })
    .returning();
  return row.id;
}

/**
 * Selesaikan (sebagian/penuh) sebuah transaksi terbuka: buat jurnal PENYELESAIAN
 * yang membersihkan akun kontrol + baris lawan yang diisi user, posting atomik, lalu
 * catat penautan & perbarui sisa/status. Semua dalam 1 transaksi ⇒ gagal = rollback.
 *
 * Baris lawan (counterLines) diisi user = ke mana nilainya sebenarnya pergi
 * (mis. beban perjalanan + kas kembali untuk pertanggungjawaban uang muka, atau
 * pendapatan untuk pelunasan DP). Sisi baris lawan = sisi saldo normal akun kontrol;
 * sistem otomatis menambah leg akun kontrol di sisi sebaliknya sebesar total lawan —
 * jadi user tidak perlu memikirkan sisi debit/kredit akun kontrol.
 */
export async function settleOpenItem(
  tx: typeof Db,
  params: {
    companyId: string;
    openItemId: string;
    entryDate: string;
    description: string;
    counterLines: { accountId: string; amount: number; description?: string | null }[];
    userId: string;
  }
): Promise<{ journalEntryId: string; entryNumber: string; settledAmount: number; remaining: number; status: "sebagian" | "selesai" }> {
  const [item] = await tx
    .select()
    .from(openItems)
    .where(and(eq(openItems.id, params.openItemId), eq(openItems.companyId, params.companyId)));
  if (!item) throw new OpenItemError("Transaksi terbuka tidak ditemukan.");
  if (item.status === "selesai") throw new OpenItemError("Transaksi ini sudah selesai — tidak bisa diselesaikan lagi.");

  const [control] = await tx
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, item.controlAccountId), eq(chartOfAccounts.companyId, params.companyId)));
  if (!control) throw new OpenItemError("Akun kontrol tidak ditemukan.");

  const counters = params.counterLines.filter((l) => l.amount > 0);
  if (counters.length < 1) throw new OpenItemError("Isi minimal 1 baris lawan dengan nominal lebih dari 0.");
  const total = counters.reduce((s, l) => s + l.amount, 0);

  const remainingBefore = Number(item.openingAmount) - Number(item.settledAmount);
  if (total > remainingBefore + EPS) {
    throw new OpenItemError(
      `Nilai penyelesaian (${total.toFixed(2)}) melebihi sisa transaksi terbuka (${remainingBefore.toFixed(2)}).`
    );
  }

  // Baris lawan di sisi saldo normal akun kontrol; leg akun kontrol di sisi sebaliknya.
  // Rekanan diwarisi OTOMATIS dari transaksi terbukanya ke semua baris jurnal
  // penyelesaian (Item 5b) — jadi biaya hasil pertanggungjawaban uang muka langsung
  // tertandai rekanannya tanpa user mengetik/memilih ulang.
  const counterOnDebit = control.normalBalance === "debit";
  const lines: NewJournalLine[] = [
    ...counters.map((l) => ({
      accountId: l.accountId,
      debit: counterOnDebit ? l.amount : 0,
      credit: counterOnDebit ? 0 : l.amount,
      description: l.description ?? null,
      organizationId: item.organizationId,
    })),
    {
      accountId: control.id,
      debit: counterOnDebit ? 0 : total,
      credit: counterOnDebit ? total : 0,
      description: `Penyelesaian: ${item.description}`,
      organizationId: item.organizationId,
    },
  ];

  const posted = await createAndPostJournal(tx, {
    companyId: params.companyId,
    entryDate: params.entryDate,
    description: params.description,
    userId: params.userId,
    lines,
    sourceType: "open_item_settlement",
    sourceId: item.id,
  });

  await tx.insert(openItemSettlements).values({
    companyId: params.companyId,
    openItemId: item.id,
    journalEntryId: posted.journalEntryId,
    amount: total.toFixed(2),
    createdBy: params.userId,
  });

  const newSettled = Number(item.settledAmount) + total;
  const status: "sebagian" | "selesai" = newSettled >= Number(item.openingAmount) - EPS ? "selesai" : "sebagian";
  await tx
    .update(openItems)
    .set({ settledAmount: newSettled.toFixed(2), status, updatedAt: new Date() })
    .where(eq(openItems.id, item.id));

  return {
    journalEntryId: posted.journalEntryId,
    entryNumber: posted.entryNumber,
    settledAmount: newSettled,
    remaining: Number(item.openingAmount) - newSettled,
    status,
  };
}
