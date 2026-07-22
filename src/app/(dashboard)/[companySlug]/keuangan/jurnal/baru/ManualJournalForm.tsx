"use client";

import { Fragment, useMemo, useState } from "react";
import { createManualJournal } from "../actions";
import { FormField, inputClass } from "@/components/ui/FormField";

type AccountOption = { id: string; label: string };
type OrgOption = { id: string; name: string };
type Row = { key: number; accountId: string; debit: string; credit: string; oiDesc: string; oiDue: string; oiOrg: string };

const rupiah = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function parseAmount(v: string): number {
  const raw = v.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ManualJournalForm({
  companySlug,
  companyId,
  accounts,
  openItemAccounts,
  organizations,
  defaultDate,
  correctsEntryId,
  correctsLabel,
  initialRows,
  initialDescription,
}: {
  companySlug: string;
  companyId: string;
  accounts: AccountOption[];
  // Akun ber-flag "transaksi terbuka" beserta SISI PEMICUNYA (uang muka = debet,
  // DP diterima = kredit). Kalau sebuah baris memakai akun ini di sisi pemicunya,
  // form otomatis meminta Pihak/Rekanan (+ jatuh tempo) untuk baris itu.
  openItemAccounts: { id: string; side: "debit" | "kredit" }[];
  /** Rekanan/klien CRM untuk menautkan transaksi terbuka (Item 5a) — opsional. */
  organizations: OrgOption[];
  defaultDate: string;
  correctsEntryId?: string;
  correctsLabel?: string;
  initialRows?: { accountId: string; debit: string; credit: string }[];
  initialDescription?: string;
}) {
  const openItemSideById = useMemo(
    () => new Map(openItemAccounts.map((a) => [a.id, a.side])),
    [openItemAccounts]
  );
  const seed: Row[] =
    initialRows && initialRows.length >= 2
      ? initialRows.map((r, i) => ({ key: i, accountId: r.accountId, debit: r.debit, credit: r.credit, oiDesc: "", oiDue: "", oiOrg: "" }))
      : [
          { key: 0, accountId: "", debit: "", credit: "", oiDesc: "", oiDue: "", oiOrg: "" },
          { key: 1, accountId: "", debit: "", credit: "", oiDesc: "", oiDue: "", oiOrg: "" },
        ];
  const [rows, setRows] = useState<Row[]>(seed);
  const [nextKey, setNextKey] = useState(seed.length);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: nextKey, accountId: "", debit: "", credit: "", oiDesc: "", oiDue: "", oiOrg: "" }]);
    setNextKey((k) => k + 1);
  }
  function removeRow(key: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((r) => r.key !== key)));
  }

  // Baris memicu transaksi terbuka kalau akunnya ber-flag DAN diisi di sisi pemicunya.
  const isOpenItemLine = (r: Row) => {
    const side = openItemSideById.get(r.accountId);
    if (!side) return false;
    return side === "debit" ? parseAmount(r.debit) > 0 : parseAmount(r.credit) > 0;
  };

  const { totalDebit, totalCredit, filledCount, openItemMissing } = useMemo(() => {
    let d = 0, c = 0, filled = 0, missing = false;
    for (const r of rows) {
      const dv = parseAmount(r.debit), cv = parseAmount(r.credit);
      if (r.accountId && (dv > 0 || cv > 0)) filled += 1;
      d += dv;
      c += cv;
      // Cukup salah satu: keterangan bebas ATAU rekanan.
      const oiSide = openItemSideById.get(r.accountId);
      const triggered = oiSide ? (oiSide === "debit" ? dv > 0 : cv > 0) : false;
      if (triggered && !r.oiDesc.trim() && !r.oiOrg) missing = true;
    }
    return { totalDebit: d, totalCredit: c, filledCount: filled, openItemMissing: missing };
  }, [rows, openItemSideById]);

  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 0.005 && totalDebit > 0;
  const canSubmit = balanced && filledCount >= 2 && !openItemMissing;

  return (
    <form action={createManualJournal} className="space-y-4">
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      {correctsEntryId && <input type="hidden" name="correctsEntryId" value={correctsEntryId} />}

      {correctsLabel && (
        <div className="rounded-lg border border-powder-blue/40 bg-powder-blue/10 px-4 py-3 text-[13px] text-ink">
          Jurnal ini akan tercatat sebagai <span className="font-semibold">koreksi</span> atas {correctsLabel}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Tanggal *">
          <input name="entryDate" type="date" required defaultValue={defaultDate} className={inputClass} />
        </FormField>
        <FormField label="Keterangan *">
          <input name="description" required defaultValue={initialDescription ?? ""} placeholder="mis. Pembayaran sewa kantor Juli 2026" className={inputClass} />
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-ink-muted/12">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAF1E5] text-[11.5px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-[10px] text-left font-bold">Akun</th>
              <th className="px-3 py-[10px] text-left font-bold">Rekanan</th>
              <th className="px-3 py-[10px] text-right font-bold">Debit</th>
              <th className="px-3 py-[10px] text-right font-bold">Kredit</th>
              <th className="px-3 py-[10px] w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const openLine = isOpenItemLine(r);
              return (
                <Fragment key={r.key}>
                  <tr className="border-t border-ink-muted/8 first:border-t-0">
                    <td className="px-3 py-2">
                      {/* Field open item selalu ada (hidden) supaya array paralel tetap
                          sejajar per indeks; input terlihat di sub-baris hanya mengedit state. */}
                      <input type="hidden" name="lineOpenItemDesc" value={r.oiDesc} />
                      <input type="hidden" name="lineOpenItemDue" value={r.oiDue} />
                      <select
                        name="lineAccountId"
                        value={r.accountId}
                        onChange={(e) => updateRow(r.key, { accountId: e.target.value })}
                        className="w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                      >
                        <option value="">— pilih akun —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        name="lineOrg"
                        value={r.oiOrg}
                        onChange={(e) => updateRow(r.key, { oiOrg: e.target.value })}
                        className="w-full min-w-36 rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                      >
                        <option value="">— tanpa rekanan —</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        name="lineDebit"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={r.debit}
                        onChange={(e) => updateRow(r.key, { debit: e.target.value, credit: e.target.value ? "" : r.credit })}
                        className="w-32 rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-right text-[13px] text-ink"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        name="lineCredit"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={r.credit}
                        onChange={(e) => updateRow(r.key, { credit: e.target.value, debit: e.target.value ? "" : r.debit })}
                        className="w-32 rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-right text-[13px] text-ink"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        disabled={rows.length <= 2}
                        aria-label="Hapus baris"
                        className="text-ink-muted hover:text-destructive disabled:opacity-30 disabled:hover:text-ink-muted"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                  {openLine && (
                    <tr className="bg-sage/5">
                      <td colSpan={5} className="px-3 pb-2.5 pt-0">
                        <div className="rounded-[9px] border border-sage-deep/25 bg-sage/10 px-3 py-2">
                          <div className="mb-1.5 text-[11px] font-semibold text-sage-deep">
                            Akun transaksi terbuka — otomatis dibuka saat diposting. Isi keterangan, atau cukup pilih <span className="underline">Rekanan</span> di baris ini.
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
                            <input
                              autoComplete="off"
                              placeholder="Pihak / keterangan (mis. Budi — dinas Surabaya)"
                              value={r.oiDesc}
                              onChange={(e) => updateRow(r.key, { oiDesc: e.target.value })}
                              className="w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                            />
                            <input
                              type="date"
                              aria-label="Jatuh tempo"
                              value={r.oiDue}
                              onChange={(e) => updateRow(r.key, { oiDue: e.target.value })}
                              className="w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-muted/15 bg-bg-base font-semibold text-ink">
              <td className="px-3 py-2">
                <button type="button" onClick={addRow} className="text-[12px] font-semibold text-sage-deep hover:underline">
                  + Tambah baris
                </button>
              </td>
              <td></td>
              <td className="px-3 py-2 text-right">{rupiah.format(totalDebit)}</td>
              <td className="px-3 py-2 text-right">{rupiah.format(totalCredit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px]">
          {totalDebit === 0 && totalCredit === 0 ? (
            <span className="text-ink-muted">Isi baris debit & kredit untuk melihat status balance.</span>
          ) : openItemMissing ? (
            <span className="font-semibold text-destructive">Isi Pihak/keterangan atau pilih Rekanan pada baris akun transaksi terbuka.</span>
          ) : balanced ? (
            <span className="font-semibold text-success">✓ Balance — siap diposting.</span>
          ) : (
            <span className="font-semibold text-destructive">
              Belum balance — selisih Rp {rupiah.format(Math.abs(diff))}. Debit harus sama dengan kredit.
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-[10px] bg-sage-deep px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Simpan &amp; Posting Jurnal
        </button>
      </div>
    </form>
  );
}
