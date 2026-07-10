"use client";

import { usePathname } from "next/navigation";
import type { SidebarGroup } from "@/components/ui/Sidebar";
import { NotificationBell } from "@/components/ui/NotificationBell";
import type { NotificationSummary } from "@/lib/notifications/getNotificationSummary";

function resolvePageTitle(pathname: string | null, groups: SidebarGroup[]): string {
  if (!pathname) return "Dashboard";
  for (const group of groups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.label;
    }
  }
  return "Dashboard";
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
