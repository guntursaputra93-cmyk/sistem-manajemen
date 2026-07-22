"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

export type ToolbarFilter = {
  /** Nama query param di URL, mis. "dept" → ?dept=... */
  name: string;
  /** Label opsi "semua", mis. "Semua Departemen" */
  allLabel: string;
  options: { value: string; label: string }[];
};

// Bar cari + filter standar (fondasi redesign) untuk halaman daftar. Sinkron ke
// URL searchParams (?q=, ?dept=, dst) sehingga penyaringan terjadi di server —
// halaman (Server Component) tinggal membaca searchParams dan memfilter query.
// Ketikan di-debounce 300ms supaya tidak memicu navigasi tiap huruf.
export function ListToolbar({
  searchPlaceholder = "Cari…",
  filters = [],
  countLabel,
}: {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  countLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    // Reset pagination saat kriteria berubah — hasil filter baru mulai dari hal. 1.
    params.delete("page");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  function onSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("q", value.trim()), 300);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] max-w-[340px] flex-1">
        <Search
          size={14}
          strokeWidth={2.5}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-full rounded-[10px] border border-ink-muted/15 bg-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-muted/60"
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.name}
          value={searchParams.get(f.name) ?? ""}
          onChange={(e) => setParam(f.name, e.target.value)}
          aria-label={f.allLabel}
          className="cursor-pointer rounded-[10px] border border-ink-muted/15 bg-surface px-3 py-2 text-[13px] text-ink"
        >
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {countLabel && <span className="ml-auto text-xs text-ink-muted">{countLabel}</span>}
    </div>
  );
}
