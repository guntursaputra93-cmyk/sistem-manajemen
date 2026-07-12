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
  return (
    <div className="bg-surface rounded-[14px] shadow-[0_2px_10px_rgba(51,57,59,0.05)] overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead className="text-sage-deep text-[10px] uppercase tracking-wide bg-sage/[0.18]">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`text-left px-4 py-[7px] font-bold ${i === 0 ? "rounded-tl-[14px]" : ""} ${i === columns.length - 1 ? "rounded-tr-[14px]" : ""} ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-ink-muted italic">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-ink-muted/10 hover:bg-bg-base transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-[7px] text-ink ${col.className ?? ""}`}>
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
