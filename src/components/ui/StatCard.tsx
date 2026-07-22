"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

// Kartu statistik interaktif (tema Sunset Peach): angka berhitung naik saat
// pertama terlihat, kartu terangkat saat hover. Menghormati
// prefers-reduced-motion (angka langsung tampil tanpa animasi).
//
// icon dioper sebagai ReactNode dari Server Component (mis. <Inbox size={15}/>)
// — referensi komponen tidak bisa dioper server→client, elemen JSX bisa.
export function StatCard({
  label,
  value,
  icon,
  iconBgClass = "bg-peach-soft",
  suffix,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  /** Class latar chip ikon, mis. "bg-peach-soft" | "bg-success/15" | "bg-destructive/10" */
  iconBgClass?: string;
  /** Teks kecil setelah angka, mis. "jam" */
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Ditunda satu frame, bukan setState sinkron di body effect — setState sinkron
      // memicu cascading render (react-hooks/set-state-in-effect). Efek visualnya
      // tetap sama: angka langsung tampil penuh tanpa animasi.
      const id = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(id);
    }
    const el = ref.current;
    if (!el) return;
    // Mulai berhitung saat kartu masuk viewport — bukan saat mount, supaya
    // kartu di bawah lipatan tetap teranimasi ketika discroll.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const duration = 800;
        function tick(t: number) {
          const p = Math.min(1, (t - t0) / duration);
          // ease-out cubic — cepat di awal, melambat mendekati target.
          setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={ref}
      className="h-full rounded-[14px] border border-ink-muted/10 bg-surface px-4 py-3.5 shadow-[0_1px_4px_rgba(59,51,44,0.05)] transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-[0_10px_24px_rgba(59,51,44,0.1)]"
    >
      {icon && (
        <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-[9px] text-peach-deep ${iconBgClass}`}>
          {icon}
        </span>
      )}
      <p className="font-display text-[22px] font-extrabold leading-tight text-ink">
        {display.toLocaleString("id-ID")}
        {suffix && <span className="ml-1 text-xs font-semibold text-ink-muted">{suffix}</span>}
      </p>
      <p className="mt-0.5 text-[11.5px] text-ink-muted">{label}</p>
    </div>
  );
}
