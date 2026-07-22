"use client";

import { Fragment, useMemo, useState } from "react";
import { createQuickJournal } from "./actions";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Badge } from "@/components/ui/Badge";

type TemplateLine = {
  id: string;
  accountLabel: string;
  side: "debit" | "kredit";
  description: string | null;
  // Sisi pemicu transaksi terbuka untuk akun baris ini; null = akun biasa.
  // Uang muka = "debit", DP diterima = "kredit".
  openItemSide: "debit" | "kredit" | null;
};

const rupiah = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function parseAmount(v: string): number {
  const raw = v.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function QuickJournalForm({
  companySlug,
  companyId,
  templateId,
  templateName,
  lines,
  organizations,
  defaultDate,
}: {
  companySlug: string;
  companyId: string;
  templateId: string;
  templateName: string;
  lines: TemplateLine[];
  /** Rekanan/klien CRM untuk menautkan transaksi terbuka (Item 5a) — opsional. */
  organizations: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  // Detail transaksi terbuka per baris — hanya relevan untuk baris debit yang akunnya
  // ber-flag is_open_item (deteksi otomatis, Item 3).
  const [oiDesc, setOiDesc] = useState<Record<string, string>>({});
  const [oiDue, setOiDue] = useState<Record<string, string>>({});
  const [oiOrg, setOiOrg] = useState<Record<string, string>>({});

  // Baris memicu transaksi terbuka kalau sisi baris template SAMA dengan sisi pemicu akunnya.
  const isOpenLine = (l: TemplateLine) => l.openItemSide !== null && l.side === l.openItemSide && parseAmount(amounts[l.id] ?? "") > 0;

  const { totalDebit, totalCredit, filledCount, openItemMissing } = useMemo(() => {
    let d = 0;
    let c = 0;
    let filled = 0;
    let missing = false;
    for (const l of lines) {
      const n = parseAmount(amounts[l.id] ?? "");
      if (n > 0) filled += 1;
      if (l.side === "debit") d += n;
      else c += n;
      // Cukup salah satu: keterangan bebas ATAU rekanan.
      if (l.openItemSide !== null && l.side === l.openItemSide && n > 0 && !(oiDesc[l.id] ?? "").trim() && !(oiOrg[l.id] ?? "")) missing = true;
    }
    return { totalDebit: d, totalCredit: c, filledCount: filled, openItemMissing: missing };
  }, [amounts, lines, oiDesc, oiOrg]);

  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 0.005 && totalDebit > 0;
  const canSubmit = balanced && filledCount >= 2 && !openItemMissing;

  return (
    <form action={createQuickJournal} className="space-y-4">
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Tanggal *">
          <input name="entryDate" type="date" required defaultValue={defaultDate} className={inputClass} />
        </FormField>
        <FormField label="Keterangan *">
          <input name="description" required defaultValue={templateName} className={inputClass} />
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-ink-muted/12">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAF1E5] text-[11.5px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-[10px] text-left font-bold">Akun</th>
              <th className="px-4 py-[10px] text-left font-bold">Rekanan</th>
              <th className="px-4 py-[10px] text-left font-bold">Sisi</th>
              <th className="px-4 py-[10px] text-right font-bold">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <Fragment key={l.id}>
                <tr className="border-t border-ink-muted/8 first:border-t-0">
                  <td className="px-4 py-2.5">
                    <div className="text-ink">{l.accountLabel}</div>
                    {l.description && <div className="text-[11px] text-ink-muted">{l.description}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      name="lineOrg"
                      aria-label="Rekanan / klien"
                      value={oiOrg[l.id] ?? ""}
                      onChange={(e) => setOiOrg((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      className="w-full min-w-36 rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                    >
                      <option value="">— tanpa rekanan —</option>
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={l.side === "debit" ? "sage" : "dusty-rose"}>{l.side === "debit" ? "Debit" : "Kredit"}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="hidden" name="lineId" value={l.id} />
                    <input type="hidden" name="lineOpenItemDesc" value={oiDesc[l.id] ?? ""} />
                    <input type="hidden" name="lineOpenItemDue" value={oiDue[l.id] ?? ""} />
                    <input
                      name="amount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={amounts[l.id] ?? ""}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      className="w-40 rounded-[9px] border border-ink-muted/15 bg-bg-base px-3 py-1.5 text-right text-[13px] text-ink"
                    />
                  </td>
                </tr>
                {isOpenLine(l) && (
                  <tr className="bg-sage/5">
                    <td colSpan={4} className="px-4 pb-2.5 pt-0">
                      <div className="rounded-[9px] border border-sage-deep/25 bg-sage/10 px-3 py-2">
                        <div className="mb-1.5 text-[11px] font-semibold text-sage-deep">
                          Akun transaksi terbuka — otomatis dibuka saat diposting. Isi keterangan, atau cukup pilih <span className="underline">Rekanan</span> di baris ini.
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
                          <input
                            autoComplete="off"
                            placeholder="Pihak / keterangan (mis. Budi — dinas Surabaya)"
                            value={oiDesc[l.id] ?? ""}
                            onChange={(e) => setOiDesc((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            className="w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                          />
                          <input
                            type="date"
                            aria-label="Jatuh tempo"
                            value={oiDue[l.id] ?? ""}
                            onChange={(e) => setOiDue((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            className="w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-[13px] text-ink"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-muted/15 bg-bg-base font-semibold">
              <td className="px-4 py-2.5 text-ink" colSpan={3}>
                Total
              </td>
              <td className="px-4 py-2.5 text-right text-ink">
                D {rupiah.format(totalDebit)} · K {rupiah.format(totalCredit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px]">
          {totalDebit === 0 && totalCredit === 0 ? (
            <span className="text-ink-muted">Isi nominal untuk melihat status balance.</span>
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
          Buat &amp; Posting Jurnal
        </button>
      </div>
    </form>
  );
}
