import { ReactNode } from "react";
import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

// Header halaman standar (fondasi redesign): breadcrumb + judul 20px + deskripsi
// + slot aksi di kanan (biasanya tombol "Tambah" yang membuka FormDrawer).
// Semua halaman modul memakai ini supaya tata letak judul/aksi konsisten.
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
}: {
  breadcrumb?: BreadcrumbItem[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5 text-xs text-ink-muted">
          {breadcrumb.map((item, i) => (
            <span key={`${item.label}-${i}`}>
              {i > 0 && <span className="mx-1.5 opacity-50">›</span>}
              {item.href ? (
                <Link href={item.href} className="hover:text-sage-deep hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold text-ink">{title}</h1>
          {description && <p className="text-[13px] text-ink-muted mt-1">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
