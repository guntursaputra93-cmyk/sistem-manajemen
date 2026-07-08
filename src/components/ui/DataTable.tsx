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
    <div className="bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-ink-muted text-xs uppercase">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`text-left px-4 py-2 font-medium ${col.className ?? ""}`}>
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
                <td key={col.key} className={`px-4 py-2 text-ink ${col.className ?? ""}`}>
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
