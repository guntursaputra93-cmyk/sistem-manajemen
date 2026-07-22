import { notFound, redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, bankReconciliations, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { openBankReconciliationAction } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", selesai: "Selesai" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { draft: "powder-blue", selesai: "sage" };
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export default async function BankReconciliationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_BANK_RECONCILIATIONS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [reconciliationList, bankAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ reconciliation: bankReconciliations, account: chartOfAccounts })
        .from(bankReconciliations)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, bankReconciliations.bankAccountId))
        .where(eq(bankReconciliations.companyId, company.id))
        .orderBy(desc(bankReconciliations.periodYear), desc(bankReconciliations.periodMonth))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), like(chartOfAccounts.code, "112%"), eq(chartOfAccounts.isHeader, false)))
    ),
  ]);

  const columns: DataTableColumn<(typeof reconciliationList)[number]>[] = [
    {
      key: "account",
      header: "Akun Bank",
      render: (r) => (
        <a href={`/${companySlug}/keuangan/rekonsiliasi-bank/${r.reconciliation.id}`} className="font-medium text-sage-deep hover:underline">
          {r.account.code} · {r.account.name}
        </a>
      ),
    },
    { key: "period", header: "Periode", render: (r) => `${MONTH_LABEL[r.reconciliation.periodMonth - 1]} ${r.reconciliation.periodYear}` },
    { key: "book", header: "Book Balance", render: (r) => formatRupiah(r.reconciliation.bookBalance), className: "text-right" },
    {
      key: "statement",
      header: "Statement Balance",
      render: (r) => (r.reconciliation.statementEndingBalance !== null ? formatRupiah(r.reconciliation.statementEndingBalance) : "-"),
      className: "text-right",
    },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.reconciliation.status] ?? "powder-blue"}>{STATUS_LABEL[r.reconciliation.status] ?? r.reconciliation.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Rekonsiliasi Bank" }]}
        title="Rekonsiliasi Bank"
        description={`Rekonsiliasi saldo buku besar vs rekening koran ${company.name}.`}
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Buka Rekonsiliasi"
              title="Buka Rekonsiliasi Baru"
              description="Sistem otomatis menarik semua mutasi posted akun ini pada periode terpilih."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {bankAccounts.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Belum ada akun bank (112xx) posting di Chart of Accounts.</p>
              ) : (
                <form action={openBankReconciliationAction}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <FormSection title="Periode & Akun">
                    <FormField label="Akun Bank *" full>
                      <select name="bankAccountId" required className={inputClass}>
                        {bankAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Bulan *">
                      <select name="periodMonth" defaultValue={new Date().getMonth() + 1} className={inputClass}>
                        {MONTH_LABEL.map((label, idx) => (
                          <option key={label} value={idx + 1}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Tahun *">
                      <input autoComplete="off" name="periodYear" type="number" defaultValue={new Date().getFullYear()} className={inputClass} />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Buka Rekonsiliasi" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={reconciliationList} rowKey={(r) => r.reconciliation.id} emptyMessage="Belum ada rekonsiliasi." />
    </div>
  );
}
