import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getIncomeStatement, type AccountBalanceRow } from "@/lib/finance/reports";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/FormField";
import { PrintButton } from "@/components/ui/PrintButton";
import { Download } from "lucide-react";
import { ReportSection } from "@/components/finance/ReportSection";

// Pilihan tingkat detail COA: tampilkan hanya sampai level tertentu. Saldo header
// sudah agregat seluruh keturunannya (rollUpAccountBalances), jadi cukup menyaring
// baris — total per bagian & laba bersih tetap benar.
const LEVEL_OPTIONS = [
  { value: "", label: "Semua akun (detail)" },
  { value: "1", label: "Level 1 — Kelompok utama" },
  { value: "2", label: "Level 2 — Golongan" },
  { value: "3", label: "Level 3 — Sub-golongan" },
];

export default async function IncomeStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ dari?: string; sampai?: string; level?: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_FINANCIAL_REPORTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const today = new Date().toISOString().slice(0, 10);
  const { dari = `${today.slice(0, 4)}-01-01`, sampai = today, level } = await searchParams;
  const maxLevel = level && ["1", "2", "3"].includes(level) ? Number(level) : null;

  const incomeStatement = await withTenantContext(tenantContext, (tx) =>
    getIncomeStatement(tx, { companyId: company.id, startDate: dari, endDate: sampai })
  );

  const byTypeAndLevel = (type: string) => (r: AccountBalanceRow) =>
    r.account.accountType === type && (maxLevel === null || r.account.level <= maxLevel);
  const pendapatanRows = incomeStatement.rows.filter(byTypeAndLevel("pendapatan"));
  const hppRows = incomeStatement.rows.filter(byTypeAndLevel("hpp"));
  const biayaRows = incomeStatement.rows.filter(byTypeAndLevel("biaya"));

  // CSV utk Excel (delimiter ; sesuai locale ID, BOM supaya UTF-8 terbaca).
  const csvLines: string[] = [
    `Laba Rugi ${company.name};;`,
    `Periode;${dari} s/d ${sampai};`,
    "Kode;Nama Akun;Saldo",
  ];
  const csvSections = [
    { title: "PENDAPATAN", rows: pendapatanRows, total: incomeStatement.pendapatanTotal },
    { title: "HPP", rows: hppRows, total: incomeStatement.hppTotal },
    { title: "BIAYA", rows: biayaRows, total: incomeStatement.biayaTotal },
  ];
  for (const s of csvSections) {
    csvLines.push(`${s.title};;`);
    for (const r of s.rows) csvLines.push(`${r.account.code};"${r.account.name.replaceAll('"', '""')}";${r.balance}`);
    csvLines.push(`;TOTAL ${s.title};${s.total}`);
  }
  csvLines.push(`;LABA KOTOR;${incomeStatement.labaKotor}`);
  csvLines.push(`;LABA BERSIH;${incomeStatement.labaBersih}`);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csvLines.join("\r\n"))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Laba Rugi" }]}
        title="Laba Rugi"
        description={`Kinerja ${company.name} pada rentang tanggal terpilih — hanya jurnal berstatus posted.`}
        actions={
          <>
            <a
              href={csvHref}
              download={`laba-rugi-${company.slug}-${dari}-${sampai}.csv`}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 px-3 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 print:hidden"
            >
              <Download size={14} aria-hidden="true" />
              Unduh Excel (CSV)
            </a>
            <PrintButton />
          </>
        }
      />

      <Card className="print:hidden" title="Filter">
        <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <input autoComplete="off" name="dari" type="date" defaultValue={dari} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <input autoComplete="off" name="sampai" type="date" defaultValue={sampai} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Tingkat Detail COA</label>
            <select name="level" defaultValue={level ?? ""} className={inputClass}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <button type="submit" className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
              Tampilkan
            </button>
          </div>
        </form>
      </Card>

      {/* 1 card utuh (bukan card terpisah per golongan) — permintaan user. */}
      <Card
        title="Laba Rugi"
        description={`Periode ${new Date(dari).toLocaleDateString("id-ID")} s/d ${new Date(sampai).toLocaleDateString("id-ID")}`}
      >
        <ReportSection label="Pendapatan" rows={pendapatanRows} total={incomeStatement.pendapatanTotal} maxLevel={maxLevel} />
        <ReportSection
          label="HPP"
          rows={hppRows}
          total={incomeStatement.hppTotal}
          maxLevel={maxLevel}
          afterTotal={
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink">
              <span className="text-[13px]">Laba Kotor</span>
              <span className="text-[13px] tabular-nums">{formatRupiah(incomeStatement.labaKotor)}</span>
            </div>
          }
        />
        <ReportSection label="Biaya" rows={biayaRows} total={incomeStatement.biayaTotal} maxLevel={maxLevel} />

        <div className="mt-4 flex items-center justify-between border-t-2 border-ink-muted/15 px-3 pt-3 text-[15px] font-bold">
          <span className="text-ink">Laba (Rugi) Bersih</span>
          <span className={`tabular-nums ${incomeStatement.labaBersih >= 0 ? "text-success" : "text-destructive"}`}>
            {formatRupiah(incomeStatement.labaBersih)}
          </span>
        </div>
      </Card>
    </div>
  );
}
