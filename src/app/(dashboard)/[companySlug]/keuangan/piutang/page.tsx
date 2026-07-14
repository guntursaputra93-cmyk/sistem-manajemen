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
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

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
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Piutang (AR Invoice)</h1>
        <p className="text-sm text-ink-muted mt-1">Invoice pelanggan {company.name}, sumber data klien &amp; kontrak dari CRM.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Buat Invoice Baru" description="Invoice dibuat sebagai draft dulu — nomor invoice baru muncul setelah diposting.">
          {contractList.length === 0 ? (
            <p className="text-xs text-ink-muted">Belum ada kontrak di CRM untuk company ini — buat kontrak dulu sebelum menagih invoice.</p>
          ) : revenueAccounts.length === 0 ? (
            <p className="text-xs text-ink-muted">Belum ada akun pendapatan posting di Chart of Accounts.</p>
          ) : (
            <form action={createInvoice} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontrak</label>
                <select name="contractId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {contractList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {orgNameByContractId.get(c.id)} · {formatRupiah(c.contractValue)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun Pendapatan</label>
                <select name="revenueAccountId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {revenueAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Invoice</label>
                <input autoComplete="off" name="invoiceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jatuh Tempo</label>
                <input autoComplete="off" name="dueDate" type="date" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nominal</label>
                <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" required placeholder="0" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Keterangan</label>
                <input autoComplete="off" name="description" placeholder="mis. Termin 1 - Sertifikasi SMK3" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="lg:col-span-3">
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                  Buat Draft
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <DataTable columns={columns} rows={invoiceList} rowKey={(inv) => inv.id} emptyMessage="Belum ada invoice." />
    </div>
  );
}
