"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, isValid, parse } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import "react-day-picker/style.css";

const ISO_FORMAT = "yyyy-MM-dd";
const DISPLAY_FORMAT = "dd/MM/yyyy";

// Rentang default dropdown tahun. PAST_SPAN mengikuti default react-day-picker
// (100 tahun ke belakang) supaya cukup untuk tanggal lahir; FUTURE_SPAN dipilih
// agar kontrak/sertifikat berjangka panjang tetap terjangkau tanpa membuat
// dropdown jadi ratusan entri.
const PAST_SPAN = 100;
const FUTURE_SPAN = 10;

/**
 * Arah rentang tahun yang wajar untuk field ini:
 * - "past"   — tanggal yang menurut definisinya sudah lewat (tanggal lahir, tanggal transaksi)
 * - "future" — tanggal yang menurut definisinya ke depan (kedaluwarsa, jatuh tempo, target)
 * - "both"   — default; dipakai kalau field bisa ke dua arah (tanggal berlaku, tanggal mulai)
 */
export type DatePickerYearRange = "past" | "future" | "both";

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

// Komponen date picker reusable — menggantikan <input type="date"> native di semua form.
// Selalu menghasilkan string ISO (yyyy-MM-dd) lewat date-fns format()/parse() dengan
// format string eksplisit, BUKAN new Date(string) ambigu — supaya tidak ada risiko
// hari/bulan tertukar (lihat investigasi date-parsing sebelumnya).
//
// Navigasi bulan memakai captionLayout="dropdown" bawaan react-day-picker: dropdown
// bulan + tahun supaya tidak perlu klik panah puluhan kali untuk tanggal lama.
// navLayout="after" wajib menyertainya — tanpa itu urutan tab tidak sejajar dengan
// urutan visual (lihat catatan pada prop navLayout di react-day-picker).
export function DatePicker({
  name,
  defaultValue,
  required,
  placeholder = "dd/mm/yyyy",
  disabled,
  yearRange = "both",
  fromYear,
  toYear,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  yearRange?: DatePickerYearRange;
  fromYear?: number;
  toYear?: number;
}) {
  const [selected, setSelected] = useState<Date | undefined>(() => parseIso(defaultValue));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isoValue = selected ? format(selected, ISO_FORMAT) : "";
  const displayValue = selected ? format(selected, DISPLAY_FORMAT) : "";

  const currentYear = new Date().getFullYear();
  let startYear = fromYear ?? (yearRange === "future" ? currentYear : currentYear - PAST_SPAN);
  let endYear = toYear ?? (yearRange === "past" ? currentYear : currentYear + FUTURE_SPAN);
  // Nilai tersimpan harus selalu bisa dijangkau ulang. Data lama bisa jatuh di luar
  // rentang yang dipilih untuk field-nya (mis. renewalReminderDate kontrak yang sudah
  // lewat pada field ber-yearRange="future"); tanpa pelebaran ini dropdown tidak bisa
  // kembali ke tahun tersebut setelah user menggesernya.
  if (selected) {
    const selectedYear = selected.getFullYear();
    startYear = Math.min(startYear, selectedYear);
    endYear = Math.max(endYear, selectedYear);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={isoValue} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] bg-bg-base text-left disabled:opacity-50 disabled:cursor-not-allowed ${
          selected ? "text-ink" : "text-ink-muted"
        }`}
      >
        <span>
          {displayValue || placeholder}
          {/* Penanda wajib hanya saat masih kosong. `aria-required` TIDAK dipakai di sini
              karena tidak valid untuk role button (jsx-a11y/role-supports-aria-props);
              kewajibannya sendiri ditegakkan server-side di action masing-masing. */}
          {required && !selected && (
            <span className="ml-1 font-semibold text-destructive" aria-hidden="true">*</span>
          )}
        </span>
        <CalendarIcon size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-2 bg-surface rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-4">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(date) => {
              setSelected(date);
              setOpen(false);
            }}
            locale={idLocale}
            captionLayout="dropdown"
            navLayout="after"
            startMonth={new Date(startYear, 0, 1)}
            endMonth={new Date(endYear, 11, 31)}
            modifiers={{ weekend: (date) => date.getDay() === 0 || date.getDay() === 6 }}
            modifiersClassNames={{ weekend: "[&>button]:text-coral-deep" }}
            classNames={{
              months: "flex flex-col",
              // relative: jangkar untuk tombol nav yang, dengan navLayout="after",
              // dirender sebagai sibling SETELAH caption (bukan di dalamnya).
              month: "relative space-y-3",
              month_caption: "flex items-center justify-start gap-2 min-h-9 pr-16",
              // Kelas bawaan rdp-* sengaja dipertahankan: stylesheet react-day-picker
              // yang mengatur <select> jadi overlay transparan di atas label, dan
              // aturan `.rdp-dropdown:focus-visible ~ .rdp-caption_label` yang memberi
              // indikator fokus keyboard. Menggantinya total menghilangkan keduanya.
              dropdowns: "rdp-dropdowns flex items-center gap-2",
              dropdown_root: "rdp-dropdown_root relative inline-flex items-center",
              dropdown: "rdp-dropdown cursor-pointer",
              caption_label:
                "inline-flex items-center gap-1 rounded-lg border border-ink-muted/15 bg-bg-base px-2 py-1 text-sm font-semibold text-ink capitalize",
              nav: "absolute right-0 top-0 flex items-center gap-1",
              button_previous: "p-1 rounded-full text-ink-muted hover:bg-bg-base hover:text-ink transition-colors disabled:opacity-30",
              button_next: "p-1 rounded-full text-ink-muted hover:bg-bg-base hover:text-ink transition-colors disabled:opacity-30",
              chevron: "fill-current",
              weekdays: "flex",
              weekday: "w-9 text-xs font-medium text-ink-muted uppercase text-center",
              week: "flex mt-1",
              day: "w-9 h-9 flex items-center justify-center p-0",
              day_button: "w-8 h-8 rounded-full text-sm text-ink hover:bg-peach/20 transition-colors",
              today: "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-ink-muted/30",
              selected: "[&>button]:bg-butter-deep [&>button]:text-white [&>button]:hover:bg-butter-deep/90",
              outside: "[&>button]:text-ink-muted/40",
              disabled: "[&>button]:text-ink-muted/30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
            }}
          />
          <div className="mt-3 flex justify-start">
            <button
              type="button"
              onClick={() => {
                setSelected(undefined);
                setOpen(false);
              }}
              className="text-xs font-medium text-ink-muted hover:text-ink border border-ink-muted/20 rounded-lg px-3 py-1.5 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
