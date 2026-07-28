import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getTerminology } from "@/lib/modules/terminology";
import {
  getWitnessCompliance,
  selectableYears,
  type WitnessComplianceStatus,
} from "@/lib/scheduling/witnessCompliance";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrintButton } from "@/components/ui/PrintButton";
import { inputClass } from "@/components/ui/FormField";

// E3 — Laporan Kepatuhan Witnessed Audit. READ-ONLY: tidak ada server action di
// sini, tidak ada tabel/kolom baru. Pola export mengikuti Item D (CSV data-URI +
// PrintButton), tanpa dependency baru.

// Istilah GENERIK sebagai default — sistem dipakai 4 perusahaan dengan jenis jasa
// berbeda (SMK3, konsultan, uji riksa), jadi "Auditor" tidak cocok untuk semua.
// Tetap lewat getTerminology dengan moduleKey 'sdm_kompetensi' supaya company yang
// nanti mengisi terminology_config otomatis ikut terpakai tanpa ubah kode.
const TERMINOLOGY_DEFAULTS = { personLabel: "Personil", assignmentLabel: "Penugasan" };

const STATUS_LABEL: Record<WitnessComplianceStatus, string> = {
  sudah: "Sudah di-witness",
  belum: "Belum di-witness",
  tanpa_penugasan: "Tanpa penugasan",
};

const STATUS_VARIANT: Record<WitnessComplianceStatus, BadgeVariant> = {
  sudah: "sage",
  belum: "destructive",
  tanpa_penugasan: "powder-blue",
};

export default async function KepatuhanWitnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ tahun?: string }>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // RBAC: MANAGE_EMPLOYEE_COMPETENCIES = [super_admin, company_admin]. Dipilih
  // karena ini permission admin milik modul kompetensi itu sendiri — memenuhi
  // syarat "minimal company_admin". VIEW_EMPLOYEE_COMPETENCIES sengaja TIDAK
  // dipakai: cakupannya sampai staff, padahal laporan ini memuat status kepatuhan
  // seluruh personil (data lintas-orang, bukan milik sendiri).
  if (!hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) =>
    requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug })
  );

  const currentYear = new Date().getFullYear();
  const parsedYear = Number.parseInt(sp.tahun ?? "", 10);
  const years = selectableYears(currentYear);
  const year = years.includes(parsedYear) ? parsedYear : currentYear;

  const [summary, terminology] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getWitnessCompliance(tx, { companyId: company.id, year })),
    withTenantContext(tenantContext, (tx) =>
      getTerminology(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", defaults: TERMINOLOGY_DEFAULTS })
    ),
  ]);

  const generatedAt = new Date();
  const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });

  // CSV (Excel) — pola persis laporan Item D & keuangan: delimiter ';', BOM UTF-8,
  // data URI tanpa route tambahan. Header ikut ditulis supaya file berdiri sendiri.
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csvLines: string[] = [
    `Laporan Kepatuhan Witnessed Audit;${esc(company.name)}`,
    `Tahun;${year}`,
    `Populasi;${summary.totalPopulation} ${terminology.personLabel.toLowerCase()} dengan kompetensi tercatat`,
    `Sudah di-witness;${summary.sudah}`,
    `Belum di-witness;${summary.belum}`,
    `Tanpa penugasan;${summary.tanpaPenugasan}`,
    `Kepatuhan;${summary.compliancePercent === null ? "-" : `${summary.compliancePercent}%`}`,
    `Dibuat pada;${dateTimeFmt.format(generatedAt)} WIB`,
    "",
    `Nama;Jabatan;Jumlah ${terminology.assignmentLabel};Sudah Di-witness;Status`,
  ];
  for (const r of summary.rows) {
    csvLines.push([
      esc(r.employeeName), esc(r.positionTitle ?? ""),
      r.assignmentCount, r.witnessedCount, esc(STATUS_LABEL[r.status]),
    ].join(";"));
  }
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csvLines.join("\r\n"))}`;

  const columns: DataTableColumn<(typeof summary.rows)[number]>[] = [
    {
      key: "nama",
      header: terminology.personLabel,
      render: (r) => (
        <span>
          {r.employeeName}
          {r.positionTitle && <span className="block text-[11.5px] text-ink-muted">{r.positionTitle}</span>}
        </span>
      ),
    },
    {
      key: "penugasan",
      header: `Jumlah ${terminology.assignmentLabel}`,
      className: "text-right",
      render: (r) => <span className="tabular-nums">{r.assignmentCount}</span>,
    },
    {
      key: "witnessed",
      header: "Sudah Di-witness",
      className: "text-right",
      render: (r) => <span className="tabular-nums">{r.witnessedCount}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "SDM" },
          { label: "Kompetensi", href: `/${companySlug}/sdm/kompetensi` },
          { label: "Kepatuhan Witnessed Audit" },
        ]}
        title="Laporan Kepatuhan Witnessed Audit"
        description={`Status witnessed audit ${year} untuk ${terminology.personLabel.toLowerCase()} yang punya kompetensi tercatat.`}
        actions={
          <>
            <a
              href={csvHref}
              download={`kepatuhan-witness-${company.slug}-${year}.csv`}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 print:hidden"
            >
              <Download size={14} aria-hidden="true" />
              Unduh Excel (CSV)
            </a>
            <PrintButton />
          </>
        }
      />

      {/* Kop khusus cetak — lembar yang diserahkan ke assessor harus berdiri sendiri. */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold text-ink">Laporan Kepatuhan Witnessed Audit — {company.name}</h1>
        <p className="text-[12px] text-ink">
          Tahun {year} · Populasi {summary.totalPopulation} {terminology.personLabel.toLowerCase()} dengan kompetensi tercatat
        </p>
      </div>

      <Card className="print:hidden" title="Filter">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Tahun</label>
            <select name="tahun" defaultValue={String(year)} className={inputClass}>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer"
          >
            Tampilkan
          </button>
        </form>
        <p className="mt-3 text-[11.5px] text-ink-muted">
          Populasi laporan adalah {terminology.personLabel.toLowerCase()} yang punya minimal satu kompetensi tercatat.
          Sebuah {terminology.assignmentLabel.toLowerCase()} dihitung melibatkan seseorang bila ia personil utama
          maupun anggota tim. Hanya {terminology.assignmentLabel.toLowerCase()} berstatus berlangsung atau selesai yang
          dihitung — yang masih dijadwalkan atau dibatalkan tidak dianggap ketidakpatuhan.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Populasi", value: summary.totalPopulation },
          { label: "Sudah di-witness", value: summary.sudah },
          { label: "Belum di-witness", value: summary.belum },
          { label: "Tanpa penugasan", value: summary.tanpaPenugasan },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-muted/12 bg-surface px-4 py-3">
            <p className="text-[11.5px] text-ink-muted">{s.label}</p>
            <p className="text-xl font-bold text-ink tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <Card
        title={`Rincian ${year}`}
        description={
          summary.compliancePercent === null
            ? `Belum ada ${terminology.assignmentLabel.toLowerCase()} yang dihitung pada tahun ini.`
            : `Kepatuhan ${summary.compliancePercent}% dari ${summary.sudah + summary.belum} ${terminology.personLabel.toLowerCase()} yang punya ${terminology.assignmentLabel.toLowerCase()} tahun ini.`
        }
      >
        {summary.rows.length === 0 ? (
          <EmptyState message={`Belum ada ${terminology.personLabel.toLowerCase()} dengan kompetensi tercatat, sehingga populasi laporan masih kosong.`} />
        ) : (
          <DataTable
            columns={columns}
            rows={summary.rows}
            rowKey={(r) => r.employeeId}
            emptyMessage="Tidak ada data."
          />
        )}
      </Card>

      <p className="text-[11.5px] text-ink-muted">
        Laporan dibuat {dateTimeFmt.format(generatedAt)} WIB oleh {session.user.name ?? session.user.email} · {company.name}.
      </p>
    </div>
  );
}
