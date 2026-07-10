"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications/getNotificationSummary";

// Badge pakai `destructive` (bukan dusty-rose-deep seperti UnreadBadge) — supaya
// beda konteks: UnreadBadge = penanda per-tab dokumen, badge ini = "perlu
// perhatian" gabungan lintas modul. Tetap dalam token warna yang sudah ada.
export function NotificationBell({ total, items }: { total: number; items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
        aria-expanded={open}
        className="relative flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-ink-muted/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-powder-blue-deep"
      >
        <Bell size={15} aria-hidden="true" />
        {total > 0 && (
          <span className="absolute top-0 right-0 inline-flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.12)] p-2 z-20">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-ink-muted text-center">Tidak ada notifikasi baru.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[11px] text-ink hover:bg-bg-base transition-colors"
                  >
                    <span>{item.label}</span>
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-semibold">
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
