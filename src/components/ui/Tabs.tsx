"use client";

import { ReactNode } from "react";
import Link from "next/link";

export type TabItem = { value: string; label: string; href?: string; badge?: ReactNode };

// Gaya pill (bukan underline). Item dgn `href` dirender sebagai Link (navigasi
// URL sungguhan, mis. Arsip — dibedakan lewat aria-current, BUKAN pola ARIA
// tablist/tab yang mengandaikan panel dikelola JS tanpa navigasi halaman).
// Item tanpa `href` pakai onChange (state client, pola ARIA tab yang sesungguhnya).
export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: TabItem[];
  value: string;
  onChange?: (value: string) => void;
}) {
  const isNav = tabs.some((t) => t.href);

  return (
    <div
      role={isNav ? undefined : "tablist"}
      className="inline-flex items-center gap-1 rounded-full bg-surface p-1 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        // text-ink (bukan sage-deep) di atas bg-sage — diaudit lewat skrip kontras
        // WCAG: sage-deep di atas sage cuma ~3.3:1, gagal syarat teks 4.5:1.
        const className = `flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-blue-deep ${
          active ? "bg-sage text-ink" : "text-ink-muted hover:text-ink"
        }`;

        if (tab.href) {
          return (
            <Link key={tab.value} href={tab.href} aria-current={active ? "page" : undefined} className={className}>
              {tab.label}
              {tab.badge}
            </Link>
          );
        }

        return (
          <button key={tab.value} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(tab.value)} className={className}>
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
