import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, journalEntryLines, chartOfAccounts, openItems, organizations, apBills, apPayments, arInvoices, arPayments, contracts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { formatRupiah as formatMoney } from "@/lib/finance/format";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

const TYPE_LABEL: Record<string, string> = { uang_muka: "Uang Muka", dp_diterima: "DP Diterima", lainnya: "Lainnya" };
const STATUS_LABEL: Record<string, string> = { terbuka: "Terbuka", sebagian: "Sebagian", selesai: "Selesai" };

export default async function KartuRekananDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; id: string }>;
}) {
  const { companySlug, id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_FINANCIAL_REPORTS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [org] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(organizations).where(and(eq(organizations.id, id), eq(organizations.companyId, company.id)))
  );
  if (!org) notFound();

  const [lines, items, openBills, apPaid, openInvoices, arPaid] = await Promise.all([
    // Hanya jurnal POSTED — jurnal void tidak boleh ikut menghitung.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ line: journalEntryLines, entry: journalEntries, account: chartOfAccounts })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .where(and(eq(journalEntryLines.companyId, company.id), eq(journalEntryLines.organizationId, org.id), eq(journalEntries.status, "posted")))
        .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ item: openItems, control: chartOfAccounts })
        .from(openItems)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, openItems.controlAccountId))
        .where(and(eq(openItems.companyId, company.id), eq(openItems.organizationId, org.id)))
        .orderBy(desc(openItems.createdAt))
    ),
    // Tagihan AP yang belum tuntas milik rekanan ini (draft & lunas dikecualikan),
    // plus pembayarannya — digabung di JS (pola sama dengan halaman daftar).
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: apBills.id, amount: apBills.amount })
        .from(apBills)
        .where(and(eq(apBills.companyId, company.id), eq(apBills.organizationId, org.id), sql`${apBills.status} not in ('draft', 'lunas')`))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ billId: apPayments.billId, paid: sql<string>`sum(${apPayments.amount})` })
        .from(apPayments)
        .where(eq(apPayments.companyId, company.id))
        .groupBy(apPayments.billId)
    ),
    // Piutang (AR) rekanan ini — ditautkan lewat contracts, jadi berlaku juga untuk
    // invoice lama yang jurnalnya belum menandai organization_id.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: arInvoices.id, amount: arInvoices.amount })
        .from(arInvoices)
        .innerJoin(contracts, eq(contracts.id, arInvoices.contractId))
        .where(and(eq(arInvoices.companyId, company.id), eq(contracts.organizationId, org.id), sql`${arInvoices.status} not in ('draft', 'lunas')`))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ invoiceId: arPayments.invoiceId, paid: sql<string>`sum(${arPayments.amount})` })
        .from(arPayments)
        .where(eq(arPayments.companyId, company.id))
        .groupBy(arPayments.invoiceId)
    ),
  ]);

  // Ringkasan
  let biaya = 0, pendapatan = 0;
  for (const l of lines) {
    if (l.account.accountType === "biaya" || l.account.accountType === "hpp") biaya += Number(l.line.debitAmount);
    if (l.account.accountType === "pendapatan") pendapatan += Number(l.line.creditAmount);
  }
  const openActive = items.filter((i) => i.item.status !== "selesai");
  const uangMuka = openActive.filter((i) => i.item.type === "uang_muka").reduce((s, i) => s + (Number(i.item.openingAmount) - Number(i.item.settledAmount)), 0);
  const dp = openActive.filter((i) => i.item.type === "dp_diterima").reduce((s, i) => s + (Number(i.item.openingAmount) - Number(i.item.settledAmount)), 0);

  // Saldo per akun (buku besar pembantu rekanan ini)
  const perAccount = new Map<string, { code: string; name: string; debit: number; credit: number }>();
  for (const l of lines) {
    const cur = perAccount.get(l.account.id) ?? { code: l.account.code, name: l.account.name, debit: 0, credit: 0 };
    cur.debit += Number(l.line.debitAmount);
    cur.credit += Number(l.line.creditAmount);
    perAccount.set(l.account.id, cur);
  }
  const accountRows = [...perAccount.values()].sort((a, b) => a.code.localeCompare(b.code));

  const apPaidByBill = new Map(apPaid.map((p) => [p.billId, Number(p.paid)]));
  const hutang = openBills.reduce((s, b) => s + (Number(b.amount) - (apPaidByBill.get(b.id) ?? 0)), 0);
  const arPaidByInvoice = new Map(arPaid.map((p) => [p.invoiceId, Number(p.paid)]));
  const piutang = openInvoices.reduce((s, i) => s + (Number(i.amount) - (arPaidByInvoice.get(i.id) ?? 0)), 0);

  const tiles = [
    { label: "Piutang (AR)", value: piutang },
    { label: "Hutang (AP)", value: hutang },
    { label: "Biaya / HPP", value: biaya },
    { label: "Pendapatan", value: pendapatan },
    { label: "Uang Muka Terbuka", value: uangMuka },
    { label: "DP Terbuka", value: dp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Kartu Rekanan", href: `/${companySlug}/keuangan/kartu-rekanan` },
          { label: org.name },
        ]}
        title={org.name}
        description={`Rekap keuangan rekanan — ${lines.length} baris jurnal terkait.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[14px] border border-ink-muted/10 bg-surface px-4 py-3.5 shadow-[0_1px_4px_rgba(59,51,44,0.05)]">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">{t.label}</div>
            <div className="mt-1 font-display text-[18px] font-extrabold text-ink">{formatMoney(t.value)}</div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <Card title="Transaksi Terbuka" description="Uang muka & DP milik rekanan ini yang belum tuntas.">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[10px] font-bold">Jenis</th>
                  <th className="text-left px-4 py-[10px] font-bold">Keterangan</th>
                  <th className="text-left px-4 py-[10px] font-bold">Akun Kontrol</th>
                  <th className="text-right px-4 py-[10px] font-bold">Nilai / Sisa</th>
                  <th className="text-left px-4 py-[10px] font-bold">Status</th>
                  {canManage && <th className="text-right px-4 py-[10px] font-bold">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.item.id} className="border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={r.item.type === "dp_diterima" ? "dusty-rose" : "powder-blue"}>{TYPE_LABEL[r.item.type] ?? r.item.type}</Badge>
                    </td>
                    <td className="px-4 py-3">{r.item.description}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.control.code} · {r.control.name}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatMoney(r.item.openingAmount)}
                      <span className="block text-[11px] text-ink-muted">sisa {formatMoney(Number(r.item.openingAmount) - Number(r.item.settledAmount))}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={r.item.status === "selesai" ? "sage" : r.item.status === "sebagian" ? "powder-blue" : "dusty-rose"}>
                        {STATUS_LABEL[r.item.status] ?? r.item.status}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link href={`/${companySlug}/keuangan/jurnal/transaksi-terbuka/${r.item.id}`} className="text-[13px] font-semibold text-sage-deep hover:underline">
                          {r.item.status === "selesai" ? "Lihat" : "Selesaikan"}
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Saldo per Akun" description="Akumulasi seluruh baris jurnal rekanan ini, dikelompokkan per akun.">
        {accountRows.length === 0 ? (
          <EmptyState message="Belum ada baris jurnal yang ditandai rekanan ini. Tandai kolom Rekanan saat membuat jurnal supaya transaksinya masuk ke kartu ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[10px] font-bold">Akun</th>
                  <th className="text-right px-4 py-[10px] font-bold">Debit</th>
                  <th className="text-right px-4 py-[10px] font-bold">Kredit</th>
                  <th className="text-right px-4 py-[10px] font-bold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {accountRows.map((a) => (
                  <tr key={a.code} className="border-t border-ink-muted/8 first:border-t-0">
                    <td className="px-4 py-3"><span className="font-medium text-ink">{a.code}</span> · {a.name}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{a.debit ? formatMoney(a.debit) : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{a.credit ? formatMoney(a.credit) : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-ink">{formatMoney(Math.abs(a.debit - a.credit))} {a.debit - a.credit >= 0 ? "D" : "K"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lines.length > 0 && (
        <Card title="Rincian Transaksi" description="Semua baris jurnal terposting yang ditandai rekanan ini.">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[10px] font-bold">Tanggal</th>
                  <th className="text-left px-4 py-[10px] font-bold">Jurnal</th>
                  <th className="text-left px-4 py-[10px] font-bold">Akun</th>
                  <th className="text-left px-4 py-[10px] font-bold">Keterangan</th>
                  <th className="text-right px-4 py-[10px] font-bold">Debit</th>
                  <th className="text-right px-4 py-[10px] font-bold">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line.id} className="border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(l.entry.entryDate).toLocaleDateString("id-ID")}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/${companySlug}/keuangan/jurnal/${l.entry.id}`} className="text-sage-deep hover:underline">
                        {l.entry.entryNumber ?? "(jurnal)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{l.account.code} · {l.account.name}</td>
                    <td className="px-4 py-3">{l.line.description ?? l.entry.description}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{Number(l.line.debitAmount) > 0 ? formatMoney(l.line.debitAmount) : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{Number(l.line.creditAmount) > 0 ? formatMoney(l.line.creditAmount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
