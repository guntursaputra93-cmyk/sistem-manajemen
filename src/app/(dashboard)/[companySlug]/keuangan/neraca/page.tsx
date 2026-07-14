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

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ per?: string }>;
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
  const { per = today } = await searchParams;

  const balanceSheet = await withTenantContext(tenantContext, (tx) => getBalanceSheet(tx, { companyId: company.id, asOfDate: per }));

  const asetRows = balanceSheet.rows.filter((r) => r.account.accountType === "aset");
  const kewajibanRows = balanceSheet.rows.filter((r) => r.account.accountType === "kewajiban");
  const modalRows = balanceSheet.rows.filter((r) => r.account.accountType === "modal");
  const isBalanced = Math.abs(balanceSheet.selisih) < 0.005;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Neraca</h1>
        <p className="text-sm text-ink-muted mt-1">Posisi keuangan {company.name} per tanggal terpilih — hanya jurnal berstatus posted.</p>
      </div>

      <Card title="Filter">
        <form method="get" className="flex items-end gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Per Tanggal</label>
            <input autoComplete="off" name="per" type="date" defaultValue={per} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Tampilkan
          </button>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Aset" description={`Total: ${formatRupiah(balanceSheet.asetTotal)}`}>
          {asetRows.map((r) => (
            <AccountRow key={r.account.id} row={r} />
          ))}
        </Card>

        <div className="space-y-6">
          <Card title="Kewajiban" description={`Total: ${formatRupiah(balanceSheet.kewajibanTotal)}`}>
            {kewajibanRows.map((r) => (
              <AccountRow key={r.account.id} row={r} />
            ))}
          </Card>

          <Card title="Modal" description={`Total (termasuk laba/rugi tahun berjalan): ${formatRupiah(balanceSheet.modalTotal)}`}>
            {modalRows.map((r) => (
              <AccountRow key={r.account.id} row={r} />
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink border-t border-ink-muted/10 mt-1 pt-2">
              <span className="text-[11px]">Laba (Rugi) Tahun Berjalan</span>
              <span className="text-[11px] tabular-nums">{formatRupiah(balanceSheet.netIncomeYtd)}</span>
            </div>
            {Math.abs(balanceSheet.unclosedPriorYearsEarnings) >= 0.005 && (
              <div className="flex items-center justify-between gap-3 px-3 py-1.5 font-bold text-ink">
                <span className="text-[11px]">Laba (Rugi) Tahun Sebelumnya (belum ditutup)</span>
                <span className="text-[11px] tabular-nums">{formatRupiah(balanceSheet.unclosedPriorYearsEarnings)}</span>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Ringkasan">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
          <div>
            <p className="text-ink-muted">Total Aset</p>
            <p className="font-bold text-ink">{formatRupiah(balanceSheet.asetTotal)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Total Kewajiban + Modal</p>
            <p className="font-bold text-ink">{formatRupiah(balanceSheet.kewajibanTotal + balanceSheet.modalTotal)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Selisih</p>
            <p className={`font-bold ${isBalanced ? "text-sage-deep" : "text-destructive"}`}>
              {formatRupiah(balanceSheet.selisih)} {isBalanced ? "(balance)" : "(TIDAK BALANCE — periksa jurnal)"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
