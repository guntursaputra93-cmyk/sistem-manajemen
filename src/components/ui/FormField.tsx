import { ReactNode } from "react";

// Standar styling input/select fondasi redesign — 13px (naik dari 11px), padding
// lebih lega. Dipakai lewat class ini supaya halaman tidak menulis ulang string
// class panjang yang beda-beda.
export const inputClass =
  "w-full rounded-[9px] border border-ink-muted/15 bg-bg-base px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted/60";

// Grup bagian form (①②③ di mockup): judul kecil uppercase hijau + garis bawah.
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-3 w-full border-b border-sage/40 pb-2 text-xs font-extrabold uppercase tracking-wider text-sage-deep">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// Wrapper label + kontrol + hint. `optional` menambah "(opsional)" abu-abu.
// `full` merentang 2 kolom di dalam FormSection.
export function FormField({
  label,
  optional = false,
  full = false,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  full?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-muted">(opsional)</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}
