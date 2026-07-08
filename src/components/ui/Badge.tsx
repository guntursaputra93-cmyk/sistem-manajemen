import { ReactNode } from "react";

export type BadgeVariant = "sage" | "powder-blue" | "dusty-rose" | "destructive";

// Tint 20% + teks ink (BUKAN warna "-deep" masing-masing varian) — diaudit lewat
// skrip kontras WCAG (Bagian 6 spesifikasi desain): kombinasi tint+"-deep" text
// gagal utk powder-blue (maks ~4.53:1 bahkan di tint 0%) dan destructive
// (~4.48:1 di tint 10%). text-ink di atas tint manapun konsisten >7.5:1.
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  sage: "bg-sage/20 text-ink",
  "powder-blue": "bg-powder-blue/20 text-ink",
  "dusty-rose": "bg-dusty-rose/20 text-ink",
  destructive: "bg-destructive/20 text-ink",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_STYLES[variant]}`}>
      {children}
    </span>
  );
}
