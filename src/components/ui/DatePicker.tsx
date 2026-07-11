"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, isValid, parse } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import "react-day-picker/style.css";

const ISO_FORMAT = "yyyy-MM-dd";
const DISPLAY_FORMAT = "dd/MM/yyyy";

function parseIso(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, ISO_FORMAT, new Date());
  return isValid(parsed) ? parsed : undefined;
}

// Komponen date picker reusable — menggantikan <input type="date"> native di semua form.
// Selalu menghasilkan string ISO (yyyy-MM-dd) lewat date-fns format()/parse() dengan
// format string eksplisit, BUKAN new Date(string) ambigu — supaya tidak ada risiko
// hari/bulan tertukar (lihat investigasi date-parsing sebelumnya).
export function DatePicker({
  name,
  defaultValue,
  required,
  placeholder = "dd/mm/yyyy",
  disabled,
}: {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
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

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={isoValue} />
      <button
        type="button"
        disabled={disabled}
        aria-required={required}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] bg-bg-base text-left disabled:opacity-50 disabled:cursor-not-allowed ${
          selected ? "text-ink" : "text-ink-muted"
        }`}
      >
        {displayValue || placeholder}
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
            modifiers={{ weekend: (date) => date.getDay() === 0 || date.getDay() === 6 }}
            modifiersClassNames={{ weekend: "[&>button]:text-dusty-rose-deep" }}
            classNames={{
              months: "flex flex-col",
              month: "space-y-3",
              month_caption: "flex items-center justify-center relative",
              caption_label: "text-sm font-semibold text-ink capitalize",
              nav: "flex items-center justify-between absolute inset-x-0 top-0",
              button_previous: "p-1 rounded-full text-ink-muted hover:bg-bg-base hover:text-ink transition-colors disabled:opacity-30",
              button_next: "p-1 rounded-full text-ink-muted hover:bg-bg-base hover:text-ink transition-colors disabled:opacity-30",
              chevron: "fill-current",
              weekdays: "flex",
              weekday: "w-9 text-xs font-medium text-ink-muted uppercase text-center",
              week: "flex mt-1",
              day: "w-9 h-9 flex items-center justify-center p-0",
              day_button: "w-8 h-8 rounded-full text-sm text-ink hover:bg-sage/20 transition-colors",
              today: "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-ink-muted/30",
              selected: "[&>button]:bg-powder-blue-deep [&>button]:text-white [&>button]:hover:bg-powder-blue-deep/90",
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
