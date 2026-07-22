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
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "RKAP" }]}
        title="RKAP — Anggaran"
        description={`Rencana anggaran ${company.name} tahun ${year}.`}
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <input autoComplete="off" name="year" type="number" defaultValue={year} className={`${inputClass} w-24`} />
              <button type="submit" className="bg-transparent border border-ink-muted/20 hover:bg-ink-muted/5 text-ink text-[13px] font-semibold px-3 py-2 rounded-[10px] transition-colors cursor-pointer">
                Tampilkan
              </button>
            </form>
            {canManage && (
              <FormDrawer
                buttonLabel="Tambah Anggaran"
                title="Tambah / Ubah Anggaran"
                description="Hanya untuk akun posting bertipe Pendapatan/HPP/Biaya. Simpan ulang akun+tahun yang sama akan meng-update anggarannya."
                defaultOpen={Boolean(error)}
              >
                {error && (
                  <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                    {error}
                  </div>
                )}
                <form action={createOrUpdateBudget}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <FormSection title="Detail Anggaran">
                    <FormField label="Akun *" full>
                      <select name="accountId" required className={inputClass}>
                        {budgetableAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name} ({ACCOUNT_TYPE_LABEL[a.accountType]})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Tahun *">
                      <input autoComplete="off" name="year" type="number" required defaultValue={year} className={inputClass} />
                    </FormField>
                    <FormField label="Anggaran Tahunan *">
                      <input autoComplete="off" name="budgetedAmount" type="number" step="0.01" min="0" required placeholder="0" className={inputClass} />
                    </FormField>
                    <FormField label="Keterangan" optional full hint="Breakdown bulanan lama otomatis dihapus saat update — isi ulang bila masih perlu.">
                      <input autoComplete="off" name="description" className={inputClass} />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Simpan Anggaran" />
                </form>
              </FormDrawer>
            )}
          </>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

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
