import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getGeneralLedgerForAccount } from "@/lib/finance/reports";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ accountId?: string; dari?: string; sampai?: string }>;
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

  const postingAccounts = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false)))
      .orderBy(asc(chartOfAccounts.code))
  );

  const today = new Date().toISOString().slice(0, 10);
  const { accountId, dari = `${today.slice(0, 4)}-01-01`, sampai = today } = await searchParams;
  const selectedAccount = postingAccounts.find((a) => a.id === accountId) ?? postingAccounts[0];

  const ledger = selectedAccount
    ? await withTenantContext(tenantContext, (tx) =>
        getGeneralLedgerForAccount(tx, { companyId: company.id, account: selectedAccount, startDate: dari, endDate: sampai })
      )
    : null;

  const columns: DataTableColumn<NonNullable<typeof ledger>["lines"][number]>[] = [
    { key: "date", header: "Tanggal", render: (l) => new Date(l.entryDate).toLocaleDateString("id-ID") },
    { key: "number", header: "Nomor Jurnal", render: (l) => l.entryNumber ?? "-" },
    { key: "description", header: "Keterangan", render: (l) => l.lineDescription ?? l.entryDescription },
    { key: "debit", header: "Debit", render: (l) => (l.debit > 0 ? formatRupiah(l.debit) : "-"), className: "text-right" },
    { key: "credit", header: "Kredit", render: (l) => (l.credit > 0 ? formatRupiah(l.credit) : "-"), className: "text-right" },
    { key: "balance", header: "Saldo", render: (l) => formatRupiah(l.runningBalance), className: "text-right font-semibold" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Buku Besar</h1>
        <p className="text-sm text-ink-muted mt-1">Mutasi per akun untuk {company.name} — hanya jurnal berstatus posted.</p>
      </div>

      <Card title="Filter">
        <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun</label>
            <select name="accountId" defaultValue={selectedAccount?.id} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
              {postingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <input autoComplete="off" name="dari" type="date" defaultValue={dari} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <input autoComplete="off" name="sampai" type="date" defaultValue={sampai} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div className="lg:col-span-4">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tampilkan
            </button>
          </div>
        </form>
      </Card>

      {selectedAccount && ledger && (
        <Card
          title={`${selectedAccount.code} · ${selectedAccount.name}`}
          description={`Saldo awal (${new Date(dari).toLocaleDateString("id-ID")}): ${formatRupiah(ledger.openingBalance)} · Saldo akhir (${new Date(sampai).toLocaleDateString("id-ID")}): ${formatRupiah(ledger.closingBalance)}`}
        >
          <DataTable columns={columns} rows={ledger.lines} rowKey={(l) => l.lineId} emptyMessage="Tidak ada mutasi posted pada rentang tanggal ini." />
        </Card>
      )}

      {!selectedAccount && <Card title="Buku Besar">Belum ada akun posting untuk perusahaan ini.</Card>}
    </div>
  );
}
