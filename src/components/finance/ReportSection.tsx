import { ReactNode } from "react";
import type { AccountBalanceRow } from "@/lib/finance/reports";
import { formatRupiah } from "@/lib/finance/format";

// Bagian laporan keuangan (dipakai Neraca & Laba Rugi) dengan format akuntansi:
// - Band judul kelompok utama TANPA angka (angkanya di baris "Jumlah" paling bawah).
// - Golongan (header level 2) ditampilkan sebagai judul tanpa angka; setelah
//   anak-anaknya selesai, muncul baris "Jumlah <golongan>".
// - Baris "Jumlah <kelompok>" di bawah sebagai penutup bagian.
// Saat tampilan diringkas sampai level ≤2 (filter Tingkat Detail COA), golongan
// tidak punya anak yang tampil — saldonya ditampilkan langsung di barisnya.

function AmountRow({
  label,
  amount,
  level = 1,
  bold = false,
  border = false,
}: {
  label: string;
  amount: number;
  level?: number;
  bold?: boolean;
  border?: boolean;
}) {
  return (
    <div
      style={{ marginLeft: `${(level - 1) * 20}px` }}
      className={`flex items-center justify-between gap-3 px-3 py-1.5 ${bold ? "font-bold" : ""} ${border ? "border-t border-ink-muted/10 mt-0.5 pt-2" : ""} text-ink`}
    >
      <span className="text-[13px]">{label}</span>
      <span className="text-[13px] tabular-nums">{formatRupiah(amount)}</span>
    </div>
  );
}

function AccountLine({ row, hideBalance = false }: { row: AccountBalanceRow; hideBalance?: boolean }) {
  const { account, balance } = row;
  return (
    <div
      style={{ marginLeft: `${(account.level - 1) * 20}px` }}
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 hover:bg-peach/10 ${account.isHeader ? "font-bold text-ink" : "text-ink"}`}
    >
      <span className="text-[13px]">{account.code} · {account.name}</span>
      {!hideBalance && <span className="text-[13px] tabular-nums">{formatRupiah(balance)}</span>}
    </div>
  );
}

export function ReportSection({
  label,
  rows,
  total,
  maxLevel,
  beforeTotal,
  afterTotal,
}: {
  label: string;
  rows: AccountBalanceRow[];
  total: number;
  maxLevel: number | null;
  /** Baris tambahan sebelum "Jumlah <label>" (mis. laba tahun berjalan di Modal). */
  beforeTotal?: ReactNode;
  /** Baris tambahan setelah "Jumlah <label>" (mis. Laba Kotor setelah HPP). */
  afterTotal?: ReactNode;
}) {
  const detail = maxLevel === null || maxLevel > 2;

  const body: ReactNode[] = [];
  let openGroup: AccountBalanceRow | null = null;
  let openGroupHasChildren = false;

  const flushGroup = () => {
    if (openGroup && openGroupHasChildren) {
      body.push(
        <AmountRow
          key={`subtotal-${openGroup.account.id}`}
          label={`Jumlah ${openGroup.account.name}`}
          amount={openGroup.balance}
          level={openGroup.account.level}
          bold
          border
        />
      );
    }
    openGroup = null;
    openGroupHasChildren = false;
  };

  for (const r of rows) {
    // Header level 1 dilewati — sudah diwakili band judul + baris Jumlah di bawah.
    if (r.account.level === 1 && r.account.isHeader) continue;

    if (detail && r.account.level === 2 && r.account.isHeader) {
      flushGroup();
      openGroup = r;
      body.push(<AccountLine key={r.account.id} row={r} hideBalance />);
      continue;
    }
    if (r.account.level <= 2) flushGroup();
    if (openGroup && r.account.level > 2) openGroupHasChildren = true;
    body.push(<AccountLine key={r.account.id} row={r} />);
  }
  flushGroup();

  return (
    <div className="mb-4">
      <div className="rounded-lg bg-peach-soft/60 px-3 py-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-peach-deep">{label}</span>
      </div>
      {body}
      {beforeTotal}
      <div className="mt-1 flex items-center justify-between gap-3 border-t-2 border-ink-muted/15 px-3 pt-2 font-bold text-ink">
        <span className="text-[13px] uppercase">Jumlah {label}</span>
        <span className="text-[13px] tabular-nums">{formatRupiah(total)}</span>
      </div>
      {afterTotal}
    </div>
  );
}
