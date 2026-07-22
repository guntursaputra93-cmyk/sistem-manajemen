"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tab bar untuk area Setting Keuangan. Extensible — tambah entri di array `tabs`
// (di layout) saat setting per-modul berikutnya ditambahkan.
export function SettingTabs({ tabs }: { tabs: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-ink-muted/12">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname?.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors ${
              active ? "border-sage-deep text-sage-deep" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
