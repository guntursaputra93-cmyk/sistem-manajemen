import { ReactNode } from "react";

// Cangkang bersama halaman auth (login/lupa-password/reset-password) — tema
// Sunset Peach: latar gradien krem→peach dengan blob dekoratif lembut dan
// kartu "kaca" (blur) di tengah. Class input/tombol diekspor supaya ketiga
// halaman memakai styling yang persis sama.
export const authInputClass =
  "w-full rounded-xl border-[1.5px] border-ink-muted/20 bg-white px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-muted/50 transition-[border-color,box-shadow] duration-200 focus:border-peach-deep focus:shadow-[0_0_0_4px_rgba(244,177,131,0.25)] focus:outline-none";

export const authButtonClass =
  "w-full rounded-xl py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(185,92,46,0.35)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(185,92,46,0.42)] active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer";

export const authButtonGradient = { background: "linear-gradient(135deg, #D97742, #B95C2E)" };

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #FDF6EE 0%, #FBE3CD 55%, #F8D3B0 100%)" }}
    >
      <div aria-hidden="true" className="absolute -top-28 -right-20 h-[420px] w-[420px] rounded-full bg-peach opacity-50 blur-[70px]" />
      <div aria-hidden="true" className="absolute -bottom-24 -left-16 h-[340px] w-[340px] rounded-full bg-coral opacity-30 blur-[70px]" />
      <div aria-hidden="true" className="absolute top-[40%] left-[12%] h-[260px] w-[260px] rounded-full bg-butter opacity-50 blur-[70px]" />

      <div className="relative w-full max-w-[400px] rounded-[22px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_50px_rgba(185,92,46,0.16)] backdrop-blur-md">
        <div
          className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl font-display text-[15px] font-extrabold text-white shadow-[0_8px_20px_rgba(185,92,46,0.35)]"
          style={{ background: "linear-gradient(135deg, #F4B183, #B95C2E)" }}
        >
          SPT
        </div>
        {children}
      </div>
    </div>
  );
}
