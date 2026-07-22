"use client";

import { ReactNode, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "./Button";

// Panel samping (drawer) untuk form tambah/edit — fondasi redesign menggantikan
// pola lama "form selalu terbuka di atas tabel". Pemakaian dari Server Component:
//
//   <FormDrawer buttonLabel="Tambah Karyawan" title="Tambah Karyawan">
//     <form action={createEmployee}>… <DrawerFooter /> …</form>
//   </FormDrawer>
//
// children dirender di server (boleh berisi server action) dan dioper sebagai
// ReactNode — state buka/tutup saja yang hidup di client.
//
// defaultOpen: buka otomatis saat halaman dimuat (mis. ada ?error= dari server
// action supaya user langsung melihat form + pesan errornya lagi).
export function FormDrawer({
  buttonLabel,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  buttonLabel: string;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // Kunci scroll halaman di belakang selama drawer terbuka.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
        {buttonLabel}
      </Button>

      {/* Overlay + panel tetap di-mount supaya isi form tidak hilang saat
          ditutup-buka (nilai yang sudah diketik tidak reset). */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Bayangan HANYA dipasang saat terbuka — panel tertutup ada di luar layar kanan,
          dan bayangan sisi kirinya akan tumpah ~30px ke DALAM viewport setinggi layar
          kalau dibiarkan aktif (menumpuk jadi "strip gelap" di tepi kanan). */}
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

// Footer standar di dalam <form> yang ada di drawer: tombol batal (menutup lewat
// event bubbling tidak bisa — cukup type="reset" tidak menutup panel, jadi
// disediakan tombol submit saja; menutup pakai X / overlay / Escape).
export function DrawerFooter({ submitLabel }: { submitLabel: string }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-ink-muted/15 bg-bg-base px-5 py-3">
      <Button type="submit">{submitLabel}</Button>
    </div>
  );
}
