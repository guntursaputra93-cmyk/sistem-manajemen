import { ReactNode } from "react";

// `message` harus 1 kalimat spesifik konteks (Bagian 5 spesifikasi desain),
// bukan "Tidak ada data" generik — contoh: "Belum ada surat masuk. Surat yang
// diregistrasi akan muncul di sini."
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
      <p className="text-sm text-ink-muted max-w-sm">{message}</p>
      {action}
    </div>
  );
}
