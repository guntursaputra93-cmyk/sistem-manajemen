import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "destructive";

// Tombol standar fondasi redesign — 13px, radius 10px. Dipakai konsisten di
// PageHeader (aksi utama), footer FormDrawer, dan form biasa, menggantikan
// class inline yang beda-beda di tiap halaman.
const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    "bg-peach-deep hover:bg-peach-deep/90 text-white font-bold shadow-[0_3px_12px_rgba(185,92,46,0.32)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(185,92,46,0.4)]",
  ghost: "bg-transparent hover:bg-ink-muted/5 text-ink font-semibold border border-ink-muted/20",
  destructive: "bg-destructive hover:bg-destructive/90 text-white font-bold",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
