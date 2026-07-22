import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, apBills, apPayments, chartOfAccounts, organizations, journalEntries } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { postBillAction, recordApPaymentAction } from "../actions";
import { formatRupiah as formatMoney } from "@/lib/finance/format";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
  jatuh_tempo: "Jatuh Tempo",
};
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  draft: "powder-blue",
  belum_dibayar: "dusty-rose",
  sebagian: "powder-blue",
  lunas: "sage",
  jatuh_tempo: "destructive",
};

export default async function HutangDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_AP_BILLS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_AP_BILLS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [row] = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ bill: apBills, org: organizations, account: chartOfAccounts })
      .from(apBills)
      .innerJoin(organizations, eq(organizations.id, apBills.organizationId))
      .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, apBills.expenseAccountId))
      .where(and(eq(apBills.id, id), eq(apBills.companyId, company.id)))
  );
  if (!row) notFound();
  const { bill, org, account } = row;

  const [payments, bankAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ payment: apPayments, bank: chartOfAccounts, journal: journalEntries })
        .from(apPayments)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, apPayments.bankAccountId))
        .innerJoin(journalEntries, eq(journalEntries.id, apPayments.journalEntryId))
        .where(eq(apPayments.billId, bill.id))
        .orderBy(desc(apPayments.paymentDate), desc(apPayments.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false), eq(chartOfAccounts.isActive, true), eq(chartOfAccounts.accountType, "aset")))
        .orderBy(asc(chartOfAccounts.code))
    ),
  ]);

  // Pembayaran hutang lazim dari kas (111xx) atau bank (112xx) — sesuai validasi lib.
  const kasBankAccounts = bankAccounts.filter((a) => a.code.startsWith("111") || a.code.startsWith("112"));

  const paid = payments.reduce((s, p) => s + Number(p.payment.amount), 0);
  const remaining = Number(bill.amount) - paid;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Hutang (AP)", href: `/${companySlug}/keuangan/hutang` },
          { label: bill.billNumber ?? "Draft" },
        ]}
        title={bill.billNumber ?? "Tagihan (draft)"}
        description={`${org.name}${bill.supplierRef ? ` · faktur ${bill.supplierRef}` : ""}`}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-[13px] rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Ringkasan Tagihan">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Status</div>
            <div className="mt-1"><Badge variant={STATUS_VARIANT[bill.status] ?? "powder-blue"}>{STATUS_LABEL[bill.status] ?? bill.status}</Badge></div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Nilai Tagihan</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(bill.amount)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Sudah Dibayar</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(paid)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Sisa</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(remaining)}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Tanggal {new Date(bill.billDate).toLocaleDateString("id-ID")} · jatuh tempo {new Date(bill.dueDate).toLocaleDateString("id-ID")} ·
          akun beban {account.code} · {account.name}
          {bill.description ? ` · ${bill.description}` : ""}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Rekanan:{" "}
          <Link href={`/${companySlug}/keuangan/kartu-rekanan/${org.id}`} className="text-sage-deep hover:underline">
            {org.name}
          </Link>
          {bill.journalEntryId && (
            <>
              {" · jurnal: "}
              <Link href={`/${companySlug}/keuangan/jurnal/${bill.journalEntryId}`} className="text-sage-deep hover:underline">
                lihat jurnal tagihan
              </Link>
            </>
          )}
        </p>
      </Card>

      {bill.status === "draft" && canManage && (
        <Card
          title="Posting Tagihan"
          description={`Membuat jurnal Debit ${account.code} ${account.name} / Kredit 21101 Utang Usaha, dan memberi nomor tagihan. Setelah diposting, tagihan tidak bisa diubah.`}
        >
          <form action={postBillAction}>
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="billId" value={bill.id} />
            <button type="submit" className="rounded-[10px] bg-sage-deep px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90">
              Posting Tagihan
            </button>
          </form>
        </Card>
      )}

      {bill.status !== "draft" && bill.status !== "lunas" && canManage && (
        <Card title="Catat Pembayaran" description={`Sisa yang bisa dibayar: ${formatMoney(remaining)}. Jurnal Debit 21101 Utang Usaha / Kredit akun kas/bank dibuat & diposting otomatis.`}>
          <form action={recordApPaymentAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="billId" value={bill.id} />
            <FormField label="Tanggal *">
              <input name="paymentDate" type="date" required defaultValue={today} className={inputClass} />
            </FormField>
            <FormField label="Nominal *">
              <input autoComplete="off" name="amount" inputMode="decimal" required placeholder="0" className={inputClass} />
            </FormField>
            <FormField label="Dari Akun Kas/Bank *">
              <select name="bankAccountId" required className={inputClass}>
                <option value="">— pilih akun —</option>
                {kasBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </select>
            </FormField>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink">Referensi</label>
              <div className="flex gap-2">
                <input autoComplete="off" name="referenceNote" placeholder="no. transfer" className={inputClass} />
                <button type="submit" className="whitespace-nowrap rounded-[9px] bg-sage-deep px-4 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90">
                  Bayar
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card title="Riwayat Pembayaran" description={`${payments.length} pembayaran tercatat.`}>
        {payments.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Belum ada pembayaran untuk tagihan ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[10px] font-bold">Tanggal</th>
                  <th className="text-left px-4 py-[10px] font-bold">Dari Akun</th>
                  <th className="text-left px-4 py-[10px] font-bold">Referensi</th>
                  <th className="text-left px-4 py-[10px] font-bold">Jurnal</th>
                  <th className="text-right px-4 py-[10px] font-bold">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.payment.id} className="border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(p.payment.paymentDate).toLocaleDateString("id-ID")}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{p.bank.code} · {p.bank.name}</td>
                    <td className="px-4 py-3">{p.payment.referenceNote ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/${companySlug}/keuangan/jurnal/${p.journal.id}`} className="text-sage-deep hover:underline">
                        {p.journal.entryNumber ?? "(jurnal)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-ink">{formatMoney(p.payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
