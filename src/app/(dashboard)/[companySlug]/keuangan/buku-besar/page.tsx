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
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/FormField";

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
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Buku Besar" }]}
        title="Buku Besar"
        description={`Mutasi per akun untuk ${company.name} — hanya jurnal berstatus posted.`}
      />

      <Card title="Filter">
        <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-ink-muted mb-1">Akun</label>
            <select name="accountId" defaultValue={selectedAccount?.id} className={inputClass}>
              {postingAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <input autoComplete="off" name="dari" type="date" defaultValue={dari} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <input autoComplete="off" name="sampai" type="date" defaultValue={sampai} className={inputClass} />
          </div>
          <div className="lg:col-span-4">
            <button type="submit" className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
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
