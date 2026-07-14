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

function AccountRow({ row }: { row: AccountBalanceRow }) {
  const { account, balance } = row;
  return (
    <div
      style={{ marginLeft: `${(account.level - 1) * 20}px` }}
      className={`flex items-center justify-between gap-3 px-3 py-1.5 ${account.isHeader ? "font-bold text-ink" : "text-ink"}`}
    >
      <span className="text-[11px]">{account.code} · {account.name}</span>
      <span className="text-[11px] tabular-nums">{formatRupiah(balance)}</span>
    </div>
  );
}

export default async function IncomeStatementPage({
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

  const incomeStatement = await withTenantContext(tenantContext, (tx) =>
    getIncomeStatement(tx, { companyId: company.id, startDate: dari, endDate: sampai })
  );

  const pendapatanRows = incomeStatement.rows.filter((r) => r.account.accountType === "pendapatan");
  const hppRows = incomeStatement.rows.filter((r) => r.account.accountType === "hpp");
  const biayaRows = incomeStatement.rows.filter((r) => r.account.accountType === "biaya");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Laba Rugi</h1>
        <p className="text-sm text-ink-muted mt-1">Kinerja {company.name} pada rentang tanggal terpilih — hanya jurnal berstatus posted.</p>
      </div>

      <Card title="Filter">
        <form method="get" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <input autoComplete="off" name="dari" type="date" defaultValue={dari} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <input autoComplete="off" name="sampai" type="date" defaultValue={sampai} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tampilkan
            </button>
          </div>
        </form>
      </Card>

      <Card title="Pendapatan" description={`Total: ${formatRupiah(incomeStatement.pendapatanTotal)}`}>
        {pendapatanRows.map((r) => (
          <AccountRow key={r.account.id} row={r} />
        ))}
      </Card>

      <Card title="HPP" description={`Total: ${formatRupiah(incomeStatement.hppTotal)}`}>
        {hppRows.map((r) => (
          <AccountRow key={r.account.id} row={r} />
        ))}
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink border-t border-ink-muted/10 mt-1 pt-2">
          <span className="text-[11px]">Laba Kotor</span>
          <span className="text-[11px] tabular-nums">{formatRupiah(incomeStatement.labaKotor)}</span>
        </div>
      </Card>

      <Card title="Biaya" description={`Total: ${formatRupiah(incomeStatement.biayaTotal)}`}>
        {biayaRows.map((r) => (
          <AccountRow key={r.account.id} row={r} />
        ))}
      </Card>

      <Card title="Laba Bersih">
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
          <span className="font-bold text-ink">Laba (Rugi) Bersih</span>
          <span className={`font-bold tabular-nums ${incomeStatement.labaBersih >= 0 ? "text-sage-deep" : "text-destructive"}`}>
            {formatRupiah(incomeStatement.labaBersih)}
          </span>
        </div>
      </Card>
    </div>
  );
}
