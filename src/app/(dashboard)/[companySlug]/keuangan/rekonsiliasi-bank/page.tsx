import { notFound, redirect } from "next/navigation";
import { and, desc, eq, like } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, bankReconciliations, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { openBankReconciliationAction } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

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
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Rekonsiliasi Bank</h1>
        <p className="text-sm text-ink-muted mt-1">Rekonsiliasi saldo buku besar vs rekening koran {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Buka Rekonsiliasi Baru" description="Sistem otomatis menarik semua mutasi posted akun ini pada periode terpilih sebagai daftar item yang bisa dicocokkan.">
          {bankAccounts.length === 0 ? (
            <p className="text-xs text-ink-muted">Belum ada akun bank (112xx) posting di Chart of Accounts.</p>
          ) : (
            <form action={openBankReconciliationAction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun Bank</label>
                <select name="bankAccountId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Bulan</label>
                <select name="periodMonth" defaultValue={new Date().getMonth() + 1} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {MONTH_LABEL.map((label, idx) => (
                    <option key={label} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
                <input autoComplete="off" name="periodYear" type="number" defaultValue={new Date().getFullYear()} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                  Buka Rekonsiliasi
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <DataTable columns={columns} rows={reconciliationList} rowKey={(r) => r.reconciliation.id} emptyMessage="Belum ada rekonsiliasi." />
    </div>
  );
}
