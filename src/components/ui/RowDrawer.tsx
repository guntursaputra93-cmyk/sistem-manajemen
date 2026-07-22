"use client";

import { ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";

// Varian FormDrawer dengan trigger teks kecil (mis. "Edit") alih-alih tombol
// primary besar — dipakai untuk aksi per baris di dalam tabel (mis. edit satu
// akun di Chart of Accounts). Sama seperti FormDrawer, children dirender di
// server (boleh berisi server action) dan dioper sebagai ReactNode; hanya state
// buka/tutup yang hidup di client. Panel tetap di-mount saat tertutup supaya isi
// form tidak reset.
export function RowDrawer({
  triggerLabel,
  triggerClassName,
  title,
  description,
  children,
}: {
  triggerLabel: string;
  triggerClassName?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "cursor-pointer text-[13px] font-medium text-sage-deep hover:underline"}
      >
        {triggerLabel}
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Bayangan HANYA dipasang saat terbuka. Kalau selalu aktif, panel yang tertutup
          (digeser ke luar layar kanan) tetap menumpahkan bayangannya ~30px ke DALAM
          viewport setinggi layar; di halaman dengan banyak baris (mis. COA dengan 117
          RowDrawer) bayangan itu menumpuk jadi "strip gelap" di tepi kanan. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed top-0 right-0 z-50 flex h-dvh w-[480px] max-w-[92vw] flex-col bg-surface transition-transform duration-300 ease-out ${
          open ? "translate-x-0 shadow-[-8px_0_30px_rgba(51,57,59,0.15)]" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-muted/15 bg-gradient-to-r from-bg-base to-surface px-5 py-4">
          <div>
            <h2 className="font-display text-base font-extrabold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup panel"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-ink-muted/8 cursor-pointer transition-transform duration-200 hover:rotate-90"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </>
  );
}
