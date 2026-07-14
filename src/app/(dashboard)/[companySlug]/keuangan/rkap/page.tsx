import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, rkapBudgets, rkapBudgetMonthly, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOrUpdateBudget } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

const ACCOUNT_TYPE_LABEL: Record<string, string> = { pendapatan: "Pendapatan", hpp: "HPP", biaya: "Biaya" };

export default async function RkapBudgetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ year?: string; error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
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

  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();

  const [budgetRows, budgetableAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ budget: rkapBudgets, account: chartOfAccounts })
        .from(rkapBudgets)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, rkapBudgets.accountId))
        .where(and(eq(rkapBudgets.companyId, company.id), eq(rkapBudgets.year, year)))
        .orderBy(asc(chartOfAccounts.code))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false), inArray(chartOfAccounts.accountType, ["pendapatan", "hpp", "biaya"])))
        .orderBy(asc(chartOfAccounts.code))
    ),
  ]);

  const budgetIds = budgetRows.map((r) => r.budget.id);
  const monthlyCountByBudgetId = new Map<string, number>();
  if (budgetIds.length > 0) {
    const monthlyRows = await withTenantContext(tenantContext, (tx) =>
      tx.select().from(rkapBudgetMonthly).where(and(eq(rkapBudgetMonthly.companyId, company.id), inArray(rkapBudgetMonthly.budgetId, budgetIds)))
    );
    for (const m of monthlyRows) {
      monthlyCountByBudgetId.set(m.budgetId, (monthlyCountByBudgetId.get(m.budgetId) ?? 0) + 1);
    }
  }

  const columns: DataTableColumn<(typeof budgetRows)[number]>[] = [
    {
      key: "account",
      header: "Akun",
      render: (r) => (
        <Link href={`/${companySlug}/keuangan/rkap/${r.budget.id}`} className="font-medium text-sage-deep hover:underline">
          {r.account.code} · {r.account.name}
        </Link>
      ),
    },
    { key: "type", header: "Tipe", render: (r) => <Badge variant="powder-blue">{ACCOUNT_TYPE_LABEL[r.account.accountType] ?? r.account.accountType}</Badge> },
    { key: "amount", header: "Anggaran Tahunan", render: (r) => formatRupiah(r.budget.budgetedAmount), className: "text-right" },
    {
      key: "monthly",
      header: "Breakdown Bulanan",
      render: (r) => (monthlyCountByBudgetId.get(r.budget.id) === 12 ? <Badge variant="sage">Ada</Badge> : <Badge variant="powder-blue">Belum</Badge>),
    },
    { key: "description", header: "Keterangan", render: (r) => r.budget.description ?? "-" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">RKAP — Anggaran</h1>
          <p className="text-sm text-ink-muted mt-1">Rencana anggaran {company.name} tahun {year}.</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input autoComplete="off" name="year" type="number" defaultValue={year} className="w-24 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
            Tampilkan
          </button>
        </form>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Tambah / Ubah Anggaran" description="Anggaran hanya bisa dibuat untuk akun posting bertipe Pendapatan/HPP/Biaya.">
          <form action={createOrUpdateBudget} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun</label>
              <select name="accountId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {budgetableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name} ({ACCOUNT_TYPE_LABEL[a.accountType]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
              <input autoComplete="off" name="year" type="number" required defaultValue={year} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Anggaran Tahunan</label>
              <input autoComplete="off" name="budgetedAmount" type="number" step="0.01" min="0" required placeholder="0" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="lg:col-span-3">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Keterangan</label>
              <input autoComplete="off" name="description" placeholder="opsional" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Simpan
              </button>
            </div>
          </form>
          <p className="text-[10px] text-ink-muted mt-2">Simpan ulang akun+tahun yang sama akan meng-update anggarannya (breakdown bulanan lama otomatis dihapus, isi ulang kalau masih perlu).</p>
        </Card>
      )}

      <DataTable columns={columns} rows={budgetRows} rowKey={(r) => r.budget.id} emptyMessage="Belum ada anggaran untuk tahun ini." />

      <p className="text-xs text-ink-muted">
        Lihat realisasi vs anggaran di{" "}
        <Link href={`/${companySlug}/keuangan/rkap/realisasi?year=${year}`} className="text-sage-deep hover:underline">
          laporan Realisasi Anggaran
        </Link>
        .
      </p>
    </div>
  );
}
