import { ReactNode } from "react";

// Tipis, bg-base, tanpa warna dominan (Bagian 2 spesifikasi desain) — supaya
// tidak bersaing secara visual dengan sidebar sage. Murni presentational,
// aksi (mis. form logout) dioper lewat slot `actions` oleh pemanggil.
export function TopBar({
  companyName,
  roleLabel,
  actions,
}: {
  companyName: string;
  roleLabel: string;
  actions?: ReactNode;
}) {
  return (
    <header className="bg-bg-base px-8 py-4 flex items-center justify-between">
      <div>
        <p className="font-display text-lg font-semibold text-ink">{companyName}</p>
        <p className="text-xs text-ink-muted">{roleLabel}</p>
      </div>
      <div className="flex items-center gap-4">{actions}</div>
    </header>
  );
}
