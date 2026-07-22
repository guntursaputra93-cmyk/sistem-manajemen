import { ReactNode } from "react";

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
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
}) {
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
                className={`text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 ${i === 0 ? "rounded-tl-[14px]" : ""} ${i === columns.length - 1 ? "rounded-tr-[14px]" : ""} ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted italic">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
