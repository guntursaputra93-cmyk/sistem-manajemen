"use client";

import { usePathname } from "next/navigation";
import type { SidebarGroup } from "@/components/ui/Sidebar";
import { NotificationBell } from "@/components/ui/NotificationBell";
import type { NotificationSummary } from "@/lib/notifications/getNotificationSummary";

// Exact match menang atas prefix match — tanpa ini, item nav yang hrefnya jadi
// prefix dari item sibling lain (mis. /penjadwalan vs /penjadwalan/rekap) akan
// "mencuri" judul halaman duluan cuma karena urutan array (lihat bug serupa
// yang sudah diperbaiki di Sidebar.tsx findActiveHref).
function resolvePageTitle(pathname: string | null, groups: SidebarGroup[]): string {
  if (!pathname) return "Dashboard";
  const allItems = groups.flatMap((g) => g.items);

  const exact = allItems.find((item) => item.href === pathname);
  if (exact) return exact.label;

  let best: (typeof allItems)[number] | null = null;
  for (const item of allItems) {
    if (pathname.startsWith(`${item.href}/`) && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best?.label ?? "Dashboard";
}

// Tipis, bg-base, tanpa warna dominan (Bagian 2 spesifikasi desain) — supaya
// tidak bersaing secara visual dengan sidebar sage. Nama perusahaan pindah ke
// header sidebar (redesign Bagian 1) — top bar sekarang menampilkan judul
// halaman aktif (Bagian 2) + notifikasi & identitas user (Bagian 3) di kanan.
export function TopBar({
  groups,
  userName,
  roleLabel,
  notification,
}: {
  groups: SidebarGroup[];
  userName: string;
  roleLabel: string;
  notification: NotificationSummary;
}) {
  const pathname = usePathname();
  const title = resolvePageTitle(pathname, groups);
  const initial = userName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="h-11 shrink-0 bg-surface border-b border-ink/[0.06] px-6 flex items-center justify-between">
      <p className="font-display text-[14px] font-bold text-ink">{title}</p>
      <div className="flex items-center gap-3">
        <NotificationBell total={notification.total} items={notification.items} />
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-[11px] font-bold text-ink leading-tight">{userName}</p>
            <p className="text-[9.5px] text-ink-muted leading-tight">{roleLabel}</p>
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-powder-blue text-powder-blue-deep font-display font-bold text-[10px]">
            {initial}
          </span>
        </div>
      </div>
    </header>
  );
}
