"use client";

import { Printer } from "lucide-react";

// Tombol cetak (→ dialog print browser, bisa "Save as PDF"). Elemen dengan class
// `print:hidden` (sidebar, topbar, filter, tombol ini sendiri) otomatis
// disembunyikan saat mencetak — lihat aturan @media print di globals.css.
export function PrintButton({ label = "Cetak / PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 bg-transparent px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 cursor-pointer print:hidden"
    >
      <Printer size={14} aria-hidden="true" />
      {label}
    </button>
  );
}
