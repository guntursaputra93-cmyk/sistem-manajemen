"use client";

import { useState } from "react";
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
  Users,
  CalendarDays,
  Award,
  Wallet,
  Mail,
  Folder,
  Handshake,
  Contact,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
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
  users: Users,
  "calendar-days": CalendarDays,
  award: Award,
  wallet: Wallet,
  mail: Mail,
  folder: Folder,
  handshake: Handshake,
  contact: Contact,
} satisfies Record<string, LucideIcon>;

export type SidebarIconName = keyof typeof ICON_MAP;
export type SidebarItem = { href: string; label: string; icon: SidebarIconName };
export type SidebarGroup = { label?: string; icon?: SidebarIconName; items: SidebarItem[] };

// Aksen aktif (border-left + tint icon chip) — teal, dipakai scoped di sini saja,
// diambil persis dari acuan desain (bukan bagian dari token pastel utama).
const ACTIVE_ACCENT = "#3D7A6B";
// Ink kehijauan dipakai khusus untuk teks di atas gradient sidebar (acuan desain) —
// beda dari token `ink` netral yang dipakai di konten utama.
const SIDEBAR_INK = "#33422D";

// Pilih SATU item paling spesifik yang aktif: exact match menang atas prefix
// match manapun. Tanpa ini, item sibling yang hrefnya jadi prefix dari href
// sibling lain (mis. /penjadwalan vs /penjadwalan/rekap) akan sama-sama
// ke-highlight saat berada di halaman yang lebih spesifik — exact match di
// /penjadwalan/rekap seharusnya menang, bukan berbagi highlight dgn /penjadwalan.
// Longest-prefix fallback tetap dipertahankan utk halaman detail yang bukan item
// nav sendiri (mis. /sdm/karyawan/[id] tetap meng-highlight "Karyawan").
function findActiveHref(pathname: string | null, groups: SidebarGroup[]): string | null {
  const allHrefs = groups.flatMap((g) => g.items.map((item) => item.href));
  if (pathname && allHrefs.includes(pathname)) return pathname;

  let best: string | null = null;
  for (const href of allHrefs) {
    if (pathname?.startsWith(`${href}/`) && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function companyInitials(code: string | null, name: string): string {
  if (code) return code.slice(0, 3).toUpperCase();
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Gradient terang (atas) ke gelap (bawah) pakai warna sage original, persis
// acuan desain — bukan solid, bukan tint pucat. Teks & aksen pakai SIDEBAR_INK/
// ACTIVE_ACCENT di atas, bukan token ink/sage-deep biasa (lihat komentar masing2).
export function Sidebar({
  groups,
  companyName,
  companyCode,
  companyTagline,
  onLogout,
}: {
  groups: SidebarGroup[];
  companyName: string;
  companyCode: string | null;
  companyTagline: string;
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, groups);
  const [collapsed, setCollapsed] = useState(false);
  // Default: grup yang berisi item aktif otomatis terbuka, sisanya tertutup —
  // grup tanpa label (Pengaturan) selalu dianggap "terbuka" karena tidak punya
  // tombol toggle (lihat kondisi render di bawah).
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    groups.forEach((group, i) => {
      const hasActiveItem = group.items.some((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`));
      if (hasActiveItem || !group.label) initial.add(i);
    });
    return initial;
  });

  function toggleGroup(i: number) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <aside
      className={`shrink-0 overflow-y-auto flex flex-col transition-[width] duration-200 px-[10px] py-3 ${
        collapsed ? "w-16" : "w-[230px]"
      }`}
      style={{ background: "linear-gradient(to bottom, #C3DBBB 0%, #A8C3A0 100%)" }}
    >
      <div className={`flex items-center gap-2 px-1.5 py-2.5 mb-1 ${collapsed ? "justify-center" : ""}`}>
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-display font-bold text-sage-deep shadow-[0_3px_8px_rgba(51,57,59,0.1)]">
          {companyInitials(companyCode, companyName)}
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-[11px] font-bold truncate" style={{ color: SIDEBAR_INK }}>
              {companyName}
            </p>
            <p className="text-[9.5px] truncate" style={{ color: SIDEBAR_INK, opacity: 0.6 }}>
              {companyTagline}
            </p>
          </div>
        )}
      </div>

      <nav aria-label="Navigasi utama" className="flex flex-col gap-1 flex-1">
        {groups.map((group, i) => {
          const isOpen = openGroups.has(i);
          const GroupIcon = group.icon ? ICON_MAP[group.icon] : null;
          return (
            <div key={group.label ?? i} className="flex flex-col">
              {group.label && !collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(i)}
                  aria-expanded={isOpen}
                  className="flex items-center gap-2 px-2 py-[7px] rounded-[10px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-deep"
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-white/55">
                    {GroupIcon && <GroupIcon size={12} strokeWidth={2.25} style={{ color: SIDEBAR_INK }} aria-hidden="true" />}
                  </span>
                  <span
                    className="flex-1 text-left text-[11.5px] font-extrabold uppercase tracking-[0.03em]"
                    style={{ color: "#2C3B26" }}
                  >
                    {group.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown size={14} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
                  )}
                </button>
              )}
              {(isOpen || collapsed || !group.label) && (
                <div
                  className={
                    group.label && !collapsed
                      ? "ml-[18px] mt-0.5 mb-1.5 pl-3 flex flex-col gap-0.5 border-l-2"
                      : "flex flex-col gap-0.5"
                  }
                  style={group.label && !collapsed ? { borderColor: "rgba(51,66,45,0.18)" } : undefined}
                >
                  {group.items.map((item) => {
                    const active = item.href === activeHref;
                    const Icon = ICON_MAP[item.icon];
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-2 rounded-lg px-2 py-[5px] text-[10.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-deep border-l-[3px] ${
                          collapsed ? "justify-center" : ""
                        } ${active ? "bg-white shadow-[0_2px_8px_rgba(51,57,59,0.1)] font-bold" : "border-l-transparent font-medium hover:bg-white/30"}`}
                        style={{ color: SIDEBAR_INK, borderLeftColor: active ? ACTIVE_ACCENT : "transparent" }}
                      >
                        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] bg-[#DFEEE2]">
                          <Icon size={11} strokeWidth={2.25} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
                        </span>
                        {!collapsed && item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-0.5 pt-2 mt-2 border-t" style={{ borderColor: "rgba(51,66,45,0.12)" }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Perluas" : undefined}
          className={`flex items-center gap-2 rounded-lg px-2 py-[5px] text-[10.5px] font-medium hover:bg-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-deep ${
            collapsed ? "justify-center" : ""
          }`}
          style={{ color: SIDEBAR_INK }}
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] bg-[#DFEEE2]">
            {collapsed ? (
              <PanelLeftOpen size={11} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={11} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
            )}
          </span>
          {!collapsed && "Sembunyikan"}
        </button>
        <form action={onLogout}>
          <button
            type="submit"
            title={collapsed ? "Keluar" : undefined}
            className={`w-full flex items-center gap-2 rounded-lg px-2 py-[5px] text-[10.5px] font-medium hover:bg-white/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-deep ${
              collapsed ? "justify-center" : ""
            }`}
            style={{ color: SIDEBAR_INK }}
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] bg-[#DFEEE2]">
              <LogOut size={11} style={{ color: SIDEBAR_INK }} aria-hidden="true" />
            </span>
            {!collapsed && "Keluar"}
          </button>
        </form>
      </div>
    </aside>
  );
}
