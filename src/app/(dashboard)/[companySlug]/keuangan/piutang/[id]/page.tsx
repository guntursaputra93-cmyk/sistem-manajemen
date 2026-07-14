import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, like } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, arInvoices, arPayments, contracts, organizations, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { postInvoiceAction, recordPaymentAction } from "../actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { TrailStepper, type TrailStep, type TrailStepStatus } from "@/components/ui/TrailStepper";

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

export default async function ArInvoiceDetailPage({
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

  const [invoice] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(arInvoices).where(and(eq(arInvoices.id, id), eq(arInvoices.companyId, company.id)))
  );
  if (!invoice) notFound();

  const [contract, revenueAccount, payments, bankAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(eq(contracts.id, invoice.contractId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, invoice.revenueAccountId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(arPayments).where(eq(arPayments.invoiceId, invoice.id)).orderBy(asc(arPayments.paymentDate), asc(arPayments.createdAt))),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), like(chartOfAccounts.code, "112%"), eq(chartOfAccounts.isHeader, false)))
    ),
  ]);

  const organization = contract
    ? await withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.id, contract.organizationId))).then((r) => r[0])
    : undefined;

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Number(invoice.amount) - totalPaid;

  // Trail: Draft -> Diposting -> Sebagian Dibayar -> Lunas, dengan cabang Jatuh
  // Tempo (pola sama seperti trail won/lost di crm/opportunities/[id]) — posisi
  // "macet"-nya trail saat jatuh_tempo ditentukan dari progress pembayaran aktual
  // (progressIndex), BUKAN dari status literal, supaya invoice yang jatuh tempo
  // SETELAH dibayar sebagian tetap menunjukkan sudah sampai mana sebelum macet.
  const amountNum = Number(invoice.amount);
  const progressIndex = totalPaid >= amountNum - 0.005 ? 3 : totalPaid > 0 ? 2 : 1;
  const INVOICE_STEP_DEFS = [
    { id: "draft", label: "Draft" },
    { id: "belum_dibayar", label: "Diposting" },
    { id: "sebagian", label: "Sebagian Dibayar" },
    { id: "lunas", label: "Lunas" },
  ];
  const invoiceTrail: TrailStep[] = INVOICE_STEP_DEFS.map((step, i) => {
    if (invoice.status === "draft") {
      return { id: step.id, label: step.label, status: i === 0 ? "done" : "upcoming" };
    }
    if (i === 0) return { id: step.id, label: step.label, status: "done" };
    if (invoice.status === "jatuh_tempo" && i === progressIndex) {
      return {
        id: step.id,
        label: "Jatuh Tempo",
        description: `Lewat jatuh tempo ${new Date(invoice.dueDate).toLocaleDateString("id-ID")} — belum lunas`,
        status: "rejected" as TrailStepStatus,
      };
    }
    if (i < progressIndex) return { id: step.id, label: step.label, status: "done" as TrailStepStatus };
    if (i === progressIndex) return { id: step.id, label: step.label, status: (invoice.status === "lunas" ? "done" : "pending") as TrailStepStatus };
    return { id: step.id, label: step.label, status: "upcoming" as TrailStepStatus };
  });

  const paymentColumns: DataTableColumn<(typeof payments)[number]>[] = [
    { key: "date", header: "Tanggal", render: (p) => new Date(p.paymentDate).toLocaleDateString("id-ID") },
    { key: "amount", header: "Nominal", render: (p) => formatRupiah(p.amount), className: "text-right" },
    { key: "reference", header: "Keterangan", render: (p) => p.referenceNote ?? "-" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">{invoice.invoiceNumber ?? "Invoice (draft)"}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {organization?.name ?? "-"} — Kontrak {formatRupiah(contract?.contractValue ?? "0")}
          </p>
        </div>
        <Link href={`/${companySlug}/keuangan/piutang`} className="text-xs text-sage-deep hover:underline">
          &larr; Kembali ke daftar invoice
        </Link>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Status Invoice">
        <TrailStepper orientation="horizontal" steps={invoiceTrail} />
      </Card>

      <Card title="Detail Invoice">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
          <div>
            <p className="text-ink-muted">Status</p>
            <Badge variant={STATUS_VARIANT[invoice.status] ?? "powder-blue"}>{STATUS_LABEL[invoice.status] ?? invoice.status}</Badge>
          </div>
          <div>
            <p className="text-ink-muted">Tanggal Invoice</p>
            <p className="font-semibold text-ink">{new Date(invoice.invoiceDate).toLocaleDateString("id-ID")}</p>
          </div>
          <div>
            <p className="text-ink-muted">Jatuh Tempo</p>
            <p className="font-semibold text-ink">{new Date(invoice.dueDate).toLocaleDateString("id-ID")}</p>
          </div>
          <div>
            <p className="text-ink-muted">Akun Pendapatan</p>
            <p className="font-semibold text-ink">{revenueAccount ? `${revenueAccount.code} · ${revenueAccount.name}` : "-"}</p>
          </div>
          <div>
            <p className="text-ink-muted">Nominal Invoice</p>
            <p className="font-semibold text-ink">{formatRupiah(invoice.amount)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Total Dibayar</p>
            <p className="font-semibold text-ink">{formatRupiah(totalPaid)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Sisa Tagihan</p>
            <p className="font-semibold text-ink">{formatRupiah(remaining > 0 ? remaining : 0)}</p>
          </div>
        </div>
        {invoice.description && <p className="text-xs text-ink-muted mt-3">{invoice.description}</p>}
      </Card>

      {invoice.status === "draft" && canManage && (
        <Card title="Posting Invoice" description="Nomor invoice akan dibuat sekarang, jurnal Debit Piutang Usaha/Kredit akun pendapatan otomatis terbentuk.">
          <form action={postInvoiceAction} className="flex items-center gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Posting Invoice
            </button>
          </form>
        </Card>
      )}

      {invoice.status !== "draft" && (
        <Card title="Riwayat Pembayaran">
          <DataTable columns={paymentColumns} rows={payments} rowKey={(p) => p.id} emptyMessage="Belum ada pembayaran." />

          {invoice.status !== "lunas" && canManage && (
            <form action={recordPaymentAction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end mt-4 pt-4 border-t border-ink-muted/10">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Bayar</label>
                <input autoComplete="off" name="paymentDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
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
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nominal</label>
                <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" required placeholder="0" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="flex items-end gap-2">
                <input autoComplete="off" name="referenceNote" placeholder="Keterangan (opsional)" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                  Catat Bayar
                </button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
