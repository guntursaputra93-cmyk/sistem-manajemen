import { ReactNode } from "react";
import Link from "next/link";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  rowHref,
  rowActionLabel = "Buka",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  /**
   * Kalau baris punya halaman detail, oper fungsi ini — tabel otomatis menambah
   * kolom aksi di paling kanan berisi tombol "Buka". Sebelumnya tiap halaman
   * hanya mengandalkan link di kolom judul, yang tidak kelihatan sebagai aksi
   * bagi user baru (temuan UX). Dipusatkan di sini supaya semua tabel konsisten.
   */
  rowHref?: (row: T) => string;
  rowActionLabel?: string;
}) {
  const totalColumns = columns.length + (rowHref ? 1 : 0);
  // Fondasi redesign: teks tabel 13px (naik dari 11px), header 11.5px uppercase
  // abu di latar netral, padding baris lebih lega, hover sage tipis.
  return (
    <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 ${i === 0 ? "rounded-tl-[14px]" : ""} ${!rowHref && i === columns.length - 1 ? "rounded-tr-[14px]" : ""} ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
            {rowHref && (
              <th className="w-px whitespace-nowrap rounded-tr-[14px] border-b border-ink-muted/12 px-4 py-[11px] text-right font-bold">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={totalColumns} className="px-4 py-8 text-center text-ink-muted italic">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 text-ink ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
              {rowHref && (
                <td className="w-px whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={rowHref(row)}
                    className="inline-flex items-center gap-1 rounded-[8px] border border-ink-muted/20 px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-sage-deep/40 hover:bg-sage/15 hover:text-sage-deep"
                  >
                    {rowActionLabel}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
