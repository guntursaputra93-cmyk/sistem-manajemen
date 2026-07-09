"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Send,
  FileText,
  Archive,
  Building2,
  Target,
  FileSignature,
  FileCheck2,
  LayoutDashboard,
  Settings,
  ArrowLeftRight,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

// Referensi komponen (fungsi) tidak bisa dioper dari Server Component ke Client
// Component — makanya layout.tsx cuma ngoper nama ikon (string), peta ke komponen
// ikonnya ada di sini.
const ICON_MAP = {
  inbox: Inbox,
  send: Send,
  "file-text": FileText,
  archive: Archive,
  "building-2": Building2,
  target: Target,
  "file-signature": FileSignature,
  "file-check": FileCheck2,
  "layout-dashboard": LayoutDashboard,
  settings: Settings,
  "arrow-left-right": ArrowLeftRight,
  "bar-chart-3": BarChart3,
} satisfies Record<string, LucideIcon>;

export type SidebarIconName = keyof typeof ICON_MAP;
export type SidebarItem = { href: string; label: string; icon: SidebarIconName };
export type SidebarGroup = { label?: string; items: SidebarItem[] };

// Latar sage solid, label ink gelap di atasnya, item aktif dapat pill putih
// (Bagian 1 & 2 spesifikasi desain) — kontras teks:sage sudah dicek AA (≥4.5:1),
// sengaja TIDAK pakai warna/opacity redup untuk label grup supaya kontras tetap aman.
export function Sidebar({ groups }: { groups: SidebarGroup[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 overflow-y-auto bg-sage flex flex-col gap-6 px-4 py-6">
      <nav aria-label="Navigasi utama" className="flex flex-col gap-6">
        {groups.map((group, i) => (
          <div key={group.label ?? i} className="flex flex-col gap-1">
            {group.label && (
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-ink">{group.label}</p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = ICON_MAP[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-deep ${
                    active ? "bg-surface text-sage-deep" : "text-ink hover:bg-surface/40"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
