import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, arInvoices, contracts, organizations, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { refreshOverdueInvoiceStatuses } from "@/lib/finance/ar";
import { createInvoice } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
  jatuh_tempo: "Jatuh Tempo",
};
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "powder-blue",
  belum_dibayar: "powder-blue",
  sebagian: "dusty-rose",
  lunas: "sage",
  jatuh_tempo: "destructive",
};

export default async function ArInvoicesPage({
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

  if (!hasPermission(session.user.role, "VIEW_AR_INVOICES")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_AR_INVOICES");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  // Refresh status jatuh_tempo dulu sebelum ditampilkan (lihat komentar
  // refreshOverdueInvoiceStatuses — sistem ini tidak punya cron/trigger).
  await withTenantContext(tenantContext, (tx) => refreshOverdueInvoiceStatuses(tx, { companyId: company.id }));

  const [invoiceList, contractList, orgList, revenueAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(arInvoices).where(eq(arInvoices.companyId, company.id)).orderBy(desc(arInvoices.invoiceDate), desc(arInvoices.createdAt))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(eq(contracts.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id))),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.accountType, "pendapatan"), eq(chartOfAccounts.isHeader, false)))
    ),
  ]);

  const orgNameByContractId = new Map(
    contractList.map((c) => [c.id, orgList.find((o) => o.id === c.organizationId)?.name ?? "-"])
  );

  const columns: DataTableColumn<(typeof invoiceList)[number]>[] = [
    {
      key: "number",
      header: "Nomor",
      render: (inv) => (
        <Link href={`/${companySlug}/keuangan/piutang/${inv.id}`} className="font-medium text-sage-deep hover:underline">
          {inv.invoiceNumber ?? "(draft)"}
        </Link>
      ),
    },
    { key: "client", header: "Klien", render: (inv) => orgNameByContractId.get(inv.contractId) ?? "-" },
    { key: "date", header: "Tgl Invoice", render: (inv) => new Date(inv.invoiceDate).toLocaleDateString("id-ID") },
    { key: "due", header: "Jatuh Tempo", render: (inv) => new Date(inv.dueDate).toLocaleDateString("id-ID") },
    { key: "amount", header: "Nominal", render: (inv) => formatRupiah(inv.amount), className: "text-right" },
    { key: "status", header: "Status", render: (inv) => <Badge variant={STATUS_VARIANT[inv.status] ?? "powder-blue"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Piutang" }]}
        title="Piutang (AR Invoice)"
        description={`Invoice pelanggan ${company.name}, sumber data klien & kontrak dari CRM.`}
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Buat Invoice"
              title="Buat Invoice Baru"
              description="Invoice dibuat sebagai draft — nomor invoice muncul setelah diposting."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {contractList.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Belum ada kontrak di CRM untuk company ini — buat kontrak dulu sebelum menagih invoice.</p>
              ) : revenueAccounts.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Belum ada akun pendapatan posting di Chart of Accounts.</p>
              ) : (
                <form action={createInvoice}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <FormSection title="① Kontrak & Akun">
                    <FormField label="Kontrak *" full>
                      <select name="contractId" required className={inputClass}>
                        {contractList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {orgNameByContractId.get(c.id)} · {formatRupiah(c.contractValue)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Akun Pendapatan *" full>
                      <select name="revenueAccountId" required className={inputClass}>
                        {revenueAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </FormSection>
                  <FormSection title="② Tanggal & Nominal">
                    <FormField label="Tanggal Invoice *">
                      <input autoComplete="off" name="invoiceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
                    </FormField>
                    <FormField label="Jatuh Tempo *">
                      <input autoComplete="off" name="dueDate" type="date" required className={inputClass} />
                    </FormField>
                    <FormField label="Nominal *">
                      <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" required placeholder="0" className={inputClass} />
                    </FormField>
                    <FormField label="Keterangan" full>
                      <input autoComplete="off" name="description" placeholder="mis. Termin 1 - Sertifikasi SMK3" className={inputClass} />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Buat Draft" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={invoiceList} rowKey={(inv) => inv.id} emptyMessage="Belum ada invoice." />
    </div>
  );
}
