"use client";

import { useMemo, useState } from "react";
import { settleOpenItemAction } from "../../actions";
import { FormField, inputClass } from "@/components/ui/FormField";

type AccountOption = { id: string; label: string };
type Row = { key: number; accountId: string; amount: string };

const rupiah = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function parseAmount(v: string): number {
  const raw = v.trim().replace(/\./g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function SettleOpenItemForm({
  companySlug,
  companyId,
  openItemId,
  accounts,
  defaultDate,
  defaultDescription,
  remaining,
  counterSideLabel,
  controlLabel,
}: {
  companySlug: string;
  companyId: string;
  openItemId: string;
  accounts: AccountOption[];
  defaultDate: string;
  defaultDescription: string;
  remaining: number;
  counterSideLabel: string;
  controlLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, accountId: "", amount: "" }]);
  const [nextKey, setNextKey] = useState(1);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: nextKey, accountId: "", amount: "" }]);
    setNextKey((k) => k + 1);
  }
  function removeRow(key: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  const { total, filledCount } = useMemo(() => {
    let t = 0, filled = 0;
    for (const r of rows) {
      const v = parseAmount(r.amount);
      if (r.accountId && v > 0) filled += 1;
      t += v;
    }
    return { total: t, filledCount: filled };
  }, [rows]);

  const overRemaining = total > remaining + 0.005;
  const canSubmit = filledCount >= 1 && total > 0 && !overRemaining;

  return (
    <form action={settleOpenItemAction} className="space-y-4">
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="openItemId" value={openItemId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Tanggal *">
          <input name="entryDate" type="date" required defaultValue={defaultDate} className={inputClass} />
        </FormField>
        <FormField label="Keterangan *">
          <input name="description" required defaultValue={defaultDescription} className={inputClass} />
        </FormField>
      </div>

      <p className="text-[12px] text-ink-muted">
        Isi baris <span className="font-semibold">lawan</span> ({counterSideLabel}) — ke mana nilainya sebenarnya pergi
        (mis. beban / kas kembali / pendapatan). Sistem otomatis menambah leg <span className="font-semibold">{controlLabel}</span> di
        sisi sebaliknya sebesar total, sehingga akun kontrol berkurang. Sisa yang bisa diselesaikan: <span className="font-semibold">Rp {rupiah.format(remaining)}</span>.
      </p>

      <div className="overflow-x-auto rounded-[12px] border border-ink-muted/12">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAF1E5] text-[11.5px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-[10px] text-left font-bold">Akun Lawan</th>
              <th className="px-3 py-[10px] text-right font-bold">Nominal ({counterSideLabel})</th>
              <th className="px-3 py-[10px] w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-ink-muted/8 first:border-t-0">
                <td className="px-3 py-2">
                  <select
                    name="counterAccountId"
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
                <td className="px-3 py-2 text-right">
                  <input
                    name="counterAmount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={r.amount}
                    onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                    className="w-36 rounded-[9px] border border-ink-muted/15 bg-bg-base px-2 py-1.5 text-right text-[13px] text-ink"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button type="button" onClick={() => removeRow(r.key)} disabled={rows.length <= 1} aria-label="Hapus baris" className="text-ink-muted hover:text-destructive disabled:opacity-30">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-muted/15 bg-bg-base font-semibold text-ink">
              <td className="px-3 py-2">
                <button type="button" onClick={addRow} className="text-[12px] font-semibold text-sage-deep hover:underline">+ Tambah baris</button>
              </td>
              <td className="px-3 py-2 text-right">{rupiah.format(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px]">
          {total === 0 ? (
            <span className="text-ink-muted">Isi nominal untuk menyelesaikan.</span>
          ) : overRemaining ? (
            <span className="font-semibold text-destructive">Total {rupiah.format(total)} melebihi sisa {rupiah.format(remaining)}.</span>
          ) : total >= remaining - 0.005 ? (
            <span className="font-semibold text-success">✓ Menyelesaikan penuh (sisa akan 0).</span>
          ) : (
            <span className="font-semibold text-ink">Penyelesaian sebagian — sisa {rupiah.format(remaining - total)}.</span>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-[10px] bg-sage-deep px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Posting Jurnal Penyelesaian
        </button>
      </div>
    </form>
  );
}
