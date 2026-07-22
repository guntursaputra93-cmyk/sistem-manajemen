import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getCashFlowReport, type CashFlowCategory, type CashFlowLine } from "@/lib/finance/cashFlow";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/FormField";
import { PrintButton } from "@/components/ui/PrintButton";
import { Download } from "lucide-react";

const CATEGORY_LABEL: Record<CashFlowCategory, string> = {
  operasi: "Arus Kas dari Aktivitas Operasi",
  investasi: "Arus Kas dari Aktivitas Investasi",
  pendanaan: "Arus Kas dari Aktivitas Pendanaan",
};

const CATEGORY_HINT: Record<CashFlowCategory, string> = {
  operasi: "Penerimaan/pengeluaran kegiatan usaha sehari-hari (pendapatan, biaya, piutang, kewajiban lancar).",
  investasi: "Pembelian/penjualan aset tetap (akun 12xxx).",
  pendanaan: "Setoran/penarikan modal & pinjaman jangka panjang.",
};

function FlowLine({ line }: { line: CashFlowLine }) {
  const inflow = line.amount >= 0;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg hover:bg-peach/10">
      <span className="min-w-0 truncate text-[13px] text-ink">
        <span className="text-ink-muted">{new Date(line.entryDate).toLocaleDateString("id-ID")}</span>
        {" · "}
        {line.entryNumber ? `${line.entryNumber} — ` : ""}
        {line.description}
      </span>
      <span className={`shrink-0 text-[13px] tabular-nums font-semibold ${inflow ? "text-success" : "text-destructive"}`}>
        {inflow ? "+" : "−"} {formatRupiah(Math.abs(line.amount))}
      </span>
    </div>
  );
}

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ dari?: string; sampai?: string }>;
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
  const { dari = `${today.slice(0, 4)}-01-01`, sampai = today } = await searchParams;

  const report = await withTenantContext(tenantContext, (tx) =>
    getCashFlowReport(tx, { companyId: company.id, startDate: dari, endDate: sampai })
  );

  const isPositive = report.netChange >= 0;

  // CSV utk Excel (delimiter ; sesuai locale ID, BOM supaya UTF-8 terbaca) —
  // sama seperti Neraca & Laba Rugi.
  const csvLines: string[] = [
    `Laporan Arus Kas ${company.name};;;`,
    `Periode;${dari} s/d ${sampai};;`,
    "Tanggal;No. Jurnal;Uraian;Jumlah",
  ];
  for (const cat of Object.keys(CATEGORY_LABEL) as CashFlowCategory[]) {
    const section = report.categories[cat];
    csvLines.push(`${CATEGORY_LABEL[cat].toUpperCase()};;;`);
    for (const l of section.lines) {
      csvLines.push(`${l.entryDate};${l.entryNumber ?? ""};"${l.description.replaceAll('"', '""')}";${l.amount}`);
    }
    csvLines.push(`;;Arus kas bersih — ${cat};${section.total}`);
  }
  csvLines.push(`;;Saldo kas & bank awal;${report.openingBalance}`);
  csvLines.push(`;;Kenaikan (penurunan) kas bersih;${report.netChange}`);
  csvLines.push(`;;Saldo kas & bank akhir;${report.closingBalance}`);
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csvLines.join("\r\n"))}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Arus Kas" }]}
        title="Laporan Arus Kas"
        description={`Mutasi kas & bank (111xx/112xx) ${company.name} — hanya jurnal berstatus posted, diklasifikasikan otomatis per aktivitas.`}
        actions={
          <>
            <a
              href={csvHref}
              download={`arus-kas-${company.slug}-${dari}-${sampai}.csv`}
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
            <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <input autoComplete="off" name="dari" type="date" defaultValue={dari} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <input autoComplete="off" name="sampai" type="date" defaultValue={sampai} className={inputClass} />
          </div>
          <button type="submit" className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
            Tampilkan
          </button>
        </form>
      </Card>

      {/* 1 card utuh (bukan card terpisah per kategori) — permintaan user. */}
      <Card
        title="Laporan Arus Kas"
        description={`Periode ${new Date(dari).toLocaleDateString("id-ID")} s/d ${new Date(sampai).toLocaleDateString("id-ID")}`}
      >
        {(Object.keys(CATEGORY_LABEL) as CashFlowCategory[]).map((cat) => {
          const section = report.categories[cat];
          return (
            <div key={cat} className="mb-4">
              <div className="rounded-lg bg-peach-soft/60 px-3 py-2" title={CATEGORY_HINT[cat]}>
                <span className="text-xs font-extrabold uppercase tracking-wider text-peach-deep">{CATEGORY_LABEL[cat]}</span>
              </div>
              {section.lines.length === 0 ? (
                <p className="px-3 py-1.5 text-[13px] italic text-ink-muted">Tidak ada transaksi kas pada kategori ini.</p>
              ) : (
                section.lines.map((line) => <FlowLine key={line.entryId} line={line} />)
              )}
              <div className="mt-1 flex items-center justify-between gap-3 border-t-2 border-ink-muted/15 px-3 pt-2 font-bold text-ink">
                <span className="text-[13px] uppercase">Arus Kas Bersih — {cat}</span>
                <span className={`text-[13px] tabular-nums ${section.total >= 0 ? "text-success" : "text-destructive"}`}>
                  {section.total >= 0 ? "+" : "−"} {formatRupiah(Math.abs(section.total))}
                </span>
              </div>
            </div>
          );
        })}

        <div className="space-y-1.5 border-t-2 border-ink-muted/15 pt-3 text-[13px]">
          <div className="flex justify-between px-3 py-1">
            <span className="text-ink-muted">Saldo kas & bank awal ({new Date(dari).toLocaleDateString("id-ID")})</span>
            <span className="tabular-nums text-ink">{formatRupiah(report.openingBalance)}</span>
          </div>
          <div className="flex justify-between px-3 py-1">
            <span className="text-ink-muted">Kenaikan / (penurunan) kas bersih</span>
            <span className={`tabular-nums font-semibold ${isPositive ? "text-success" : "text-destructive"}`}>
              {isPositive ? "+" : "−"} {formatRupiah(Math.abs(report.netChange))}
            </span>
          </div>
          <div className="flex justify-between px-3 pt-1 font-bold text-ink">
            <span>Saldo kas & bank akhir ({new Date(sampai).toLocaleDateString("id-ID")})</span>
            <span className="tabular-nums">{formatRupiah(report.closingBalance)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
