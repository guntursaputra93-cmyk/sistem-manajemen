import { ReactNode } from "react";

export type BadgeVariant = "sage" | "powder-blue" | "dusty-rose" | "destructive";

// Tema Sunset Peach: varian "sage" dipakai halaman-halaman sebagai makna
// SUKSES/aktif (mis. status "Aktif", "Disetujui") — supaya tetap terbaca
// sebagai hijau-oke (bukan peach), varian ini dipetakan ke hijau zaitun redup
// (--color-success), bukan alias sage→peach. Varian lain mengikuti palet baru.
// Teks tetap ink di atas tint supaya kontras aman (>7:1).
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  sage: "bg-success/20 text-ink",
  "powder-blue": "bg-butter/30 text-ink",
  "dusty-rose": "bg-coral/25 text-ink",
  destructive: "bg-destructive/20 text-ink",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${VARIANT_STYLES[variant]}`}>
      {children}
    </span>
  );
}
