import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, rkapBudgets, rkapBudgetMonthly, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { saveMonthlyBreakdown } from "../actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export default async function RkapBudgetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_RKAP_BUDGETS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_RKAP_BUDGETS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [row] = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ budget: rkapBudgets, account: chartOfAccounts })
      .from(rkapBudgets)
      .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, rkapBudgets.accountId))
      .where(and(eq(rkapBudgets.id, id), eq(rkapBudgets.companyId, company.id)))
  );
  if (!row) notFound();

  const monthlyRows = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(rkapBudgetMonthly).where(eq(rkapBudgetMonthly.budgetId, row.budget.id)).orderBy(asc(rkapBudgetMonthly.month))
  );
  const amountByMonth = new Map(monthlyRows.map((m) => [m.month, m.budgetedAmount]));
  const monthlySum = monthlyRows.reduce((s, m) => s + Number(m.budgetedAmount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "RKAP", href: `/${companySlug}/keuangan/rkap?year=${row.budget.year}` },
          { label: `${row.account.code} · ${row.account.name}` },
        ]}
        title={`${row.account.code} · ${row.account.name}`}
        description={`Anggaran tahun ${row.budget.year} — ${formatRupiah(row.budget.budgetedAmount)}`}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card
        title="Breakdown Bulanan"
        description={`Total 12 bulan harus sama dengan anggaran tahunan (${formatRupiah(row.budget.budgetedAmount)}). Total saat ini: ${formatRupiah(monthlySum)}.`}
      >
        {canManage ? (
          <form action={saveMonthlyBreakdown} className="space-y-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="budgetId" value={row.budget.id} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {MONTH_LABEL.map((label, idx) => (
                <div key={label}>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">{label}</label>
                  <input
                    autoComplete="off"
                    name={`month_${idx + 1}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={amountByMonth.get(idx + 1) ?? "0"}
                    className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
                  />
                </div>
              ))}
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Simpan Breakdown
            </button>
          </form>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px]">
            {MONTH_LABEL.map((label, idx) => (
              <div key={label}>
                <p className="text-ink-muted">{label}</p>
                <p className="font-semibold text-ink">{formatRupiah(amountByMonth.get(idx + 1) ?? "0")}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
