import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import {
  getAuditTrailPage,
  getAuditTrailForExport,
  getDistinctEntityTypes,
  summarizeMetadata,
  EXPORT_MAX_ROWS,
  REPORT_TIME_ZONE,
  REPORT_TZ_LABEL,
} from "@/lib/audit/report";
import { parsePage, totalPages, PAGE_SIZE } from "@/lib/pagination";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/Pagination";
import { inputClass } from "@/components/ui/FormField";

// Laporan Audit Trail (Item D, inisiatif Kesiapan Audit Kepatuhan Data).
// Ditaruh di bawah Pengaturan karena aksesnya admin-only, sejalur dengan halaman
// administratif lain. READ-ONLY sepenuhnya — tidak ada server action di sini.
//
// Rentang tanggal WAJIB (default 30 hari terakhir) supaya tidak pernah ada query
// tanpa pembatas; lihat catatan performa di lib/audit/report.ts.

const DEFAULT_RANGE_DAYS = 30;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

/** Tanggal valid & tidak terbalik; kalau ngawur, jatuh balik ke default. */
function normalizeRange(rawFrom?: string, rawTo?: string): { from: string; to: string } {
  const fallback = defaultRange();
  const ok = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)));
  const from = ok(rawFrom) ? rawFrom! : fallback.from;
  const to = ok(rawTo) ? rawTo! : fallback.to;
  return from > to ? { from: to, to: from } : { from, to };
}

// timeZone eksplisit: server bisa berjalan di UTC (Vercel), sedangkan filter
// tanggal diinterpretasi sebagai WIB. Tanpa ini, jam yang tampil tidak sesuai
// dengan rentang tanggal yang dipilih user.
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

export default async function AuditTrailReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{
    from?: string; to?: string; entityType?: string; entityId?: string; userId?: string; page?: string;
  }>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // RBAC ketat: hanya super_admin & company_admin (VIEW_AUDIT_TRAIL). Jejak
  // seluruh user adalah data sensitif — department_head/staff tidak boleh masuk.
  if (!hasPermission(session.user.role, "VIEW_AUDIT_TRAIL")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const { from, to } = normalizeRange(sp.from, sp.to);
  const entityType = sp.entityType?.trim() || null;
  const entityId = sp.entityId?.trim() || null;
  const userId = sp.userId?.trim() || null;
  const page = parsePage(sp.page);
  const filter = { companyId: company.id, from, to, entityType, entityId, userId };

  const [{ rows, total }, entityTypes, userList, exportData] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getAuditTrailPage(tx, filter, page)),
    withTenantContext(tenantContext, (tx) => getDistinctEntityTypes(tx, company.id)),
    withTenantContext(tenantContext, (tx) =>
      tx.select({ id: users.id, fullName: users.fullName, role: users.role })
        .from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
    withTenantContext(tenantContext, (tx) => getAuditTrailForExport(tx, filter)),
  ]);

  const generatedAt = new Date();

  // --- CSV (Excel) : pola persis laporan keuangan — delimiter ';' sesuai locale
  // ID, BOM supaya UTF-8 terbaca Excel, di-embed sebagai data URI tanpa route
  // tambahan. Header laporan ikut ditulis supaya file berdiri sendiri saat
  // diserahkan ke auditor.
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const activeFilters = [
    `Rentang tanggal;${from} s/d ${to}`,
    `Jenis entitas;${entityType ?? "(semua)"}`,
    `ID entitas;${entityId ?? "(semua)"}`,
    `Pelaku;${userId ? (userList.find((u) => u.id === userId)?.fullName ?? userId) : "(semua)"}`,
  ];
  const csvLines: string[] = [
    `Laporan Audit Trail;${esc(company.name)}`,
    ...activeFilters,
    `Jumlah baris;${exportData.rows.length}${exportData.truncated ? ` (dipotong di ${EXPORT_MAX_ROWS})` : ""}`,
    `Dibuat pada;${dateTimeFmt.format(generatedAt)} ${REPORT_TZ_LABEL}`,
    "",
    // Dua kolom waktu disengaja: WIB untuk dibaca manusia/auditor, ISO UTC
    // untuk diolah mesin — supaya tidak ada ambiguitas zona waktu sama sekali.
    `Waktu (${REPORT_TZ_LABEL});Waktu (UTC ISO);Pelaku;Email Pelaku;Aksi;Jenis Entitas;ID Entitas;IP;Metadata`,
  ];
  for (const r of exportData.rows) {
    csvLines.push([
      esc(dateTimeFmt.format(r.createdAt)),
      esc(r.createdAt.toISOString()),
      esc(r.actorName ?? (r.userId ? "(user dihapus)" : "(sistem)")),
      esc(r.actorEmail ?? ""),
      esc(r.action),
      esc(r.entityType ?? ""),
      esc(r.entityId ?? ""),
      esc(r.ipAddress ?? ""),
      esc(r.metadata ? JSON.stringify(r.metadata) : ""),
    ].join(";"));
  }
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csvLines.join("\r\n"))}`;
  const csvName = `audit-trail-${company.slug}-${from}_${to}${entityId ? `-${entityId.slice(0, 8)}` : ""}.csv`;

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "waktu",
      header: `Waktu (${REPORT_TZ_LABEL})`,
      render: (r) => <span className="tabular-nums whitespace-nowrap">{dateTimeFmt.format(r.createdAt)}</span>,
    },
    {
      key: "pelaku",
      header: "Pelaku",
      render: (r) =>
        r.actorName ? (
          <span>
            {r.actorName}
            {r.actorEmail && <span className="block text-[11.5px] text-ink-muted">{r.actorEmail}</span>}
          </span>
        ) : (
          // user_id terisi tapi usernya sudah dihapus — dibedakan dari aksi
          // sistem (user_id null) supaya auditor tidak salah tafsir.
          <span className="text-ink-muted italic">{r.userId ? "(user dihapus)" : "(sistem)"}</span>
        ),
    },
    { key: "aksi", header: "Aksi", render: (r) => <span className="font-medium">{r.action}</span> },
    { key: "entitas", header: "Jenis Entitas", render: (r) => r.entityType ?? "—" },
    {
      key: "entityId",
      header: "ID Entitas",
      render: (r) =>
        r.entityId ? (
          <span className="font-mono text-[11.5px]" title={r.entityId}>{r.entityId.slice(0, 8)}…</span>
        ) : (
          "—"
        ),
    },
    {
      key: "metadata",
      header: "Ringkasan",
      render: (r) => <span className="text-[11.5px] text-ink-muted">{summarizeMetadata(r.metadata)}</span>,
    },
  ];

  const isDrillDown = Boolean(entityId);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Pengaturan", href: `/${companySlug}/pengaturan` },
          { label: "Laporan Audit Trail" },
        ]}
        title="Laporan Audit Trail"
        description={
          isDrillDown
            ? "Riwayat lengkap satu record spesifik — siap diserahkan ke auditor eksternal."
            : `Jejak seluruh aksi tercatat di ${company.name}. Hanya bisa dibaca; data tidak dapat diubah atau dihapus.`
        }
        actions={
          <>
            <a
              href={csvHref}
              download={csvName}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 print:hidden"
            >
              <Download size={14} aria-hidden="true" />
              Unduh Excel (CSV)
            </a>
            <PrintButton />
          </>
        }
      />

      {/* Kop laporan — hanya muncul saat dicetak/PDF, supaya lembar yang
          diserahkan ke auditor berdiri sendiri tanpa konteks layar. */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold text-ink">Laporan Audit Trail — {company.name}</h1>
        <p className="text-[12px] text-ink">
          Periode {from} s/d {to}
          {entityType && ` · Jenis entitas: ${entityType}`}
          {entityId && ` · ID entitas: ${entityId}`}
          {userId && ` · Pelaku: ${userList.find((u) => u.id === userId)?.fullName ?? userId}`}
        </p>
        <p className="text-[12px] text-ink">Total {total} baris tercatat pada periode ini.</p>
      </div>

      <Card className="print:hidden" title="Filter">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tanggal *</label>
            <input autoComplete="off" name="from" type="date" defaultValue={from} required className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tanggal *</label>
            <input autoComplete="off" name="to" type="date" defaultValue={to} required className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Jenis Entitas</label>
            <select name="entityType" defaultValue={entityType ?? ""} className={inputClass}>
              <option value="">Semua jenis</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Pelaku</label>
            <select name="userId" defaultValue={userId ?? ""} className={inputClass}>
              <option value="">Semua pelaku</option>
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">ID Entitas (drill-down)</label>
            <input
              autoComplete="off"
              name="entityId"
              defaultValue={entityId ?? ""}
              placeholder="mis. UUID satu case"
              className={`${inputClass} w-[260px] font-mono`}
            />
          </div>
          <button
            type="submit"
            className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer"
          >
            Tampilkan
          </button>
        </form>
        <p className="mt-3 text-[11.5px] text-ink-muted">
          Rentang tanggal wajib diisi — laporan tanpa batas waktu tidak dijalankan demi menjaga performa.
          Unduhan CSV memuat seluruh baris pada filter ini (bukan hanya halaman yang tampil).
        </p>
      </Card>

      {exportData.truncated && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink print:hidden">
          Hasil melebihi {EXPORT_MAX_ROWS.toLocaleString("id-ID")} baris. Tabel di bawah tetap benar, tetapi
          <strong> unduhan CSV akan terpotong</strong> — persempit rentang tanggal atau tambahkan filter sebelum mengunduh.
        </div>
      )}

      <Card
        title={isDrillDown ? "Riwayat Entitas" : "Hasil"}
        description={`${total.toLocaleString("id-ID")} baris · periode ${from} s/d ${to}`}
      >
        {rows.length === 0 ? (
          <EmptyState message="Tidak ada aktivitas tercatat pada filter ini. Coba perlebar rentang tanggal." />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              emptyMessage="Tidak ada aktivitas tercatat pada filter ini."
            />
            <div className="print:hidden">
              <Pagination
                basePath={`/${companySlug}/pengaturan/audit-trail`}
                searchParams={sp as Record<string, string | undefined>}
                pageParamName="page"
                currentPage={page}
                totalPages={totalPages(total)}
              />
            </div>
            <p className="mt-3 text-[11.5px] text-ink-muted print:hidden">
              Menampilkan {Math.min(PAGE_SIZE, rows.length)} dari {total.toLocaleString("id-ID")} baris.
            </p>
          </>
        )}
      </Card>

      {/* Footer laporan — waktu generate wajib ada supaya auditor tahu laporan
          ini potret kapan. Tampil di layar maupun hasil cetak. */}
      <p className="text-[11.5px] text-ink-muted">
        Laporan dibuat {dateTimeFmt.format(generatedAt)} {REPORT_TZ_LABEL} oleh{" "}
        {session.user.name ?? session.user.email} · {company.name}. Seluruh waktu ditampilkan dalam{" "}
        {REPORT_TZ_LABEL}. Audit trail bersifat append-only: baris tidak dapat diubah atau dihapus oleh peran mana pun.
      </p>
    </div>
  );
}
