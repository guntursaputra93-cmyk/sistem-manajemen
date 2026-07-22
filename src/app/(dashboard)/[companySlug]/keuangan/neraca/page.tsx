import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getBalanceSheet, type AccountBalanceRow } from "@/lib/finance/reports";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/FormField";
import { PrintButton } from "@/components/ui/PrintButton";
import { Download } from "lucide-react";
import { ReportSection } from "@/components/finance/ReportSection";

// Pilihan tingkat detail COA (permintaan user): tampilkan hanya sampai level
// tertentu. Saldo header sudah agregat seluruh keturunannya (rollUpAccountBalances),
// jadi cukup menyaring baris — angka total tetap benar.
const LEVEL_OPTIONS = [
  { value: "", label: "Semua akun (detail)" },
  { value: "1", label: "Level 1 — Kelompok utama" },
  { value: "2", label: "Level 2 — Golongan" },
  { value: "3", label: "Level 3 — Sub-golongan" },
];

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ per?: string; level?: string }>;
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
  const { per = today, level } = await searchParams;
  const maxLevel = level && ["1", "2", "3"].includes(level) ? Number(level) : null;

  const balanceSheet = await withTenantContext(tenantContext, (tx) => getBalanceSheet(tx, { companyId: company.id, asOfDate: per }));

  const byTypeAndLevel = (type: string) => (r: AccountBalanceRow) =>
    r.account.accountType === type && (maxLevel === null || r.account.level <= maxLevel);
  const asetRows = balanceSheet.rows.filter(byTypeAndLevel("aset"));
  const kewajibanRows = balanceSheet.rows.filter(byTypeAndLevel("kewajiban"));
  const modalRows = balanceSheet.rows.filter(byTypeAndLevel("modal"));
  const isBalanced = Math.abs(balanceSheet.selisih) < 0.005;

  // CSV utk Excel (delimiter ; sesuai locale ID, BOM supaya UTF-8 terbaca) —
  // di-embed sebagai data URI, tanpa route/dependensi tambahan.
  const csvSections: { title: string; rows: AccountBalanceRow[]; total: number }[] = [
    { title: "ASET", rows: asetRows, total: balanceSheet.asetTotal },
    { title: "KEWAJIBAN", rows: kewajibanRows, total: balanceSheet.kewajibanTotal },
    { title: "MODAL", rows: modalRows, total: balanceSheet.modalTotal },
  ];
  const csvLines: string[] = [`Neraca ${company.name};;`, `Per tanggal;${per};`, "Kode;Nama Akun;Saldo"];
  for (const s of csvSections) {
    csvLines.push(`${s.title};;`);
    for (const r of s.rows) csvLines.push(`${r.account.code};"${r.account.name.replaceAll('"', '""')}";${r.balance}`);
    csvLines.push(`;TOTAL ${s.title};${s.total}`);
  }
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csvLines.join("\r\n"))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Neraca" }]}
        title="Neraca"
        description={`Posisi keuangan ${company.name} per tanggal terpilih — hanya jurnal berstatus posted.`}
        actions={
          <>
            <a
              href={csvHref}
              download={`neraca-${company.slug}-${per}.csv`}
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
        <form method="get" className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Per Tanggal</label>
            <input autoComplete="off" name="per" type="date" defaultValue={per} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Tingkat Detail COA</label>
            <select name="level" defaultValue={level ?? ""} className={inputClass}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
            Tampilkan
          </button>
        </form>
      </Card>

      {/* 1 card utuh — subtotal per golongan, jumlah kelompok utama di bawah tiap bagian. */}
      <Card title="Neraca" description={`Per ${new Date(per).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`}>
        <ReportSection label="Aset" rows={asetRows} total={balanceSheet.asetTotal} maxLevel={maxLevel} />
        <ReportSection label="Kewajiban" rows={kewajibanRows} total={balanceSheet.kewajibanTotal} maxLevel={maxLevel} />
        <ReportSection
          label="Modal"
          rows={modalRows}
          total={balanceSheet.modalTotal}
          maxLevel={maxLevel}
          beforeTotal={
            <>
              <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink">
                <span className="text-[13px]">Laba (Rugi) Tahun Berjalan</span>
                <span className="text-[13px] tabular-nums">{formatRupiah(balanceSheet.netIncomeYtd)}</span>
              </div>
              {Math.abs(balanceSheet.unclosedPriorYearsEarnings) >= 0.005 && (
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink">
                  <span className="text-[13px]">Laba (Rugi) Tahun Sebelumnya (belum ditutup)</span>
                  <span className="text-[13px] tabular-nums">{formatRupiah(balanceSheet.unclosedPriorYearsEarnings)}</span>
                </div>
              )}
            </>
          }
        />

        <div className="mt-4 space-y-1 border-t-2 border-ink-muted/15 pt-3">
          <div className="flex items-center justify-between px-3 text-[13px] font-bold text-ink">
            <span>Total Aset</span>
            <span className="tabular-nums">{formatRupiah(balanceSheet.asetTotal)}</span>
          </div>
          <div className="flex items-center justify-between px-3 text-[13px] font-bold text-ink">
            <span>Total Kewajiban + Modal</span>
            <span className="tabular-nums">{formatRupiah(balanceSheet.kewajibanTotal + balanceSheet.modalTotal)}</span>
          </div>
          <div className={`flex items-center justify-between px-3 text-[13px] font-bold ${isBalanced ? "text-success" : "text-destructive"}`}>
            <span>Selisih {isBalanced ? "(balance)" : "(TIDAK BALANCE — periksa jurnal)"}</span>
            <span className="tabular-nums">{formatRupiah(balanceSheet.selisih)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
