import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, journalEntryLines, chartOfAccounts, openItems, organizations, apBills, apPayments, arInvoices, arPayments, contracts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { formatRupiah as formatMoney } from "@/lib/finance/format";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function KartuRekananPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ q?: string; tipe?: string }>;
}) {
  const { companySlug } = await params;
  const { q, tipe } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_FINANCIAL_REPORTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [orgs, lineAgg, openAgg, openBills, apPaid, openInvoices, arPaid] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: organizations.id, name: organizations.name, partnerType: organizations.partnerType })
        .from(organizations)
        .where(eq(organizations.companyId, company.id))
        .orderBy(asc(organizations.name))
    ),
    // Rekap baris jurnal per rekanan per tipe akun — hanya jurnal POSTED
    // (draft tidak ada lagi; void tidak boleh ikut dihitung).
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({
          organizationId: journalEntryLines.organizationId,
          accountType: chartOfAccounts.accountType,
          debit: sql<string>`sum(${journalEntryLines.debitAmount})`,
          credit: sql<string>`sum(${journalEntryLines.creditAmount})`,
          lines: sql<number>`count(*)::int`,
        })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .where(and(eq(journalEntryLines.companyId, company.id), isNotNull(journalEntryLines.organizationId), eq(journalEntries.status, "posted")))
        .groupBy(journalEntryLines.organizationId, chartOfAccounts.accountType)
    ),
    // Sisa transaksi terbuka (uang muka / DP) per rekanan.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({
          organizationId: openItems.organizationId,
          type: openItems.type,
          sisa: sql<string>`sum(${openItems.openingAmount} - ${openItems.settledAmount})`,
        })
        .from(openItems)
        .where(and(eq(openItems.companyId, company.id), isNotNull(openItems.organizationId), sql`${openItems.status} <> 'selesai'`))
        .groupBy(openItems.organizationId, openItems.type)
    ),
    // Sisa hutang (AP) per rekanan dihitung dari dua query sederhana lalu digabung di
    // JS — lebih jelas & terbukti benar dibanding subquery berkorelasi di dalam agregat.
    // Draft & lunas dikecualikan: draft belum jadi kewajiban, lunas sudah nol.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: apBills.id, organizationId: apBills.organizationId, amount: apBills.amount })
        .from(apBills)
        .where(and(eq(apBills.companyId, company.id), sql`${apBills.status} not in ('draft', 'lunas')`))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ billId: apPayments.billId, paid: sql<string>`sum(${apPayments.amount})` })
        .from(apPayments)
        .where(eq(apPayments.companyId, company.id))
        .groupBy(apPayments.billId)
    ),
    // Sisa piutang (AR) per rekanan. AR menautkan klien lewat contracts (bukan kolom
    // sendiri), jadi rekanannya diambil dari contract — cara ini berlaku juga untuk
    // invoice LAMA yang jurnalnya belum menandai organization_id.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: arInvoices.id, organizationId: contracts.organizationId, amount: arInvoices.amount })
        .from(arInvoices)
        .innerJoin(contracts, eq(contracts.id, arInvoices.contractId))
        .where(and(eq(arInvoices.companyId, company.id), sql`${arInvoices.status} not in ('draft', 'lunas')`))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ invoiceId: arPayments.invoiceId, paid: sql<string>`sum(${arPayments.amount})` })
        .from(arPayments)
        .where(eq(arPayments.companyId, company.id))
        .groupBy(arPayments.invoiceId)
    ),
  ]);

  type Sum = { biaya: number; pendapatan: number; lines: number; uangMuka: number; dp: number; hutang: number; piutang: number };
  const byOrg = new Map<string, Sum>();
  const blank = (): Sum => ({ biaya: 0, pendapatan: 0, lines: 0, uangMuka: 0, dp: 0, hutang: 0, piutang: 0 });
  for (const r of lineAgg) {
    if (!r.organizationId) continue;
    const s = byOrg.get(r.organizationId) ?? blank();
    // Biaya & HPP diakui dari sisi debit; pendapatan dari sisi kredit.
    if (r.accountType === "biaya" || r.accountType === "hpp") s.biaya += Number(r.debit);
    if (r.accountType === "pendapatan") s.pendapatan += Number(r.credit);
    s.lines += Number(r.lines);
    byOrg.set(r.organizationId, s);
  }
  for (const r of openAgg) {
    if (!r.organizationId) continue;
    const s = byOrg.get(r.organizationId) ?? blank();
    if (r.type === "uang_muka") s.uangMuka += Number(r.sisa);
    else if (r.type === "dp_diterima") s.dp += Number(r.sisa);
    byOrg.set(r.organizationId, s);
  }
  const paidByBill = new Map(apPaid.map((p) => [p.billId, Number(p.paid)]));
  for (const b of openBills) {
    const s = byOrg.get(b.organizationId) ?? blank();
    s.hutang += Number(b.amount) - (paidByBill.get(b.id) ?? 0);
    byOrg.set(b.organizationId, s);
  }
  const paidByInvoice = new Map(arPaid.map((p) => [p.invoiceId, Number(p.paid)]));
  for (const inv of openInvoices) {
    const s = byOrg.get(inv.organizationId) ?? blank();
    s.piutang += Number(inv.amount) - (paidByInvoice.get(inv.id) ?? 0);
    byOrg.set(inv.organizationId, s);
  }

  const needle = q?.trim().toLowerCase();
  const rows = orgs
    .map((o) => ({ ...o, ...(byOrg.get(o.id) ?? blank()) }))
    .filter((r) => (needle ? r.name.toLowerCase().includes(needle) : true))
    // Filter tipe: 'keduanya' ikut tampil baik saat memfilter klien maupun pemasok.
    .filter((r) => (tipe ? r.partnerType === tipe || r.partnerType === "keduanya" : true))
    // Yang punya aktivitas keuangan tampil lebih dulu.
    .sort(
      (a, b) =>
        (b.lines + b.uangMuka + b.dp + b.hutang + b.piutang) - (a.lines + a.uangMuka + a.dp + a.hutang + a.piutang) ||
        a.name.localeCompare(b.name)
    );

  const withActivity = rows.filter((r) => r.lines > 0 || r.uangMuka > 0 || r.dp > 0 || r.hutang > 0 || r.piutang > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Kartu Rekanan" }]}
        title="Kartu Rekanan"
        description="Rekap keuangan per klien/rekanan — biaya, pendapatan, uang muka & DP yang masih terbuka."
      />

      <ListToolbar
        searchPlaceholder="Cari nama rekanan…"
        filters={[
          {
            name: "tipe",
            allLabel: "Semua Tipe",
            options: [
              { value: "klien", label: "Klien" },
              { value: "pemasok", label: "Pemasok / Vendor" },
            ],
          },
        ]}
        countLabel={`${rows.length} rekanan · ${withActivity} beraktivitas`}
      />

      {rows.length === 0 ? (
        <EmptyState message="Belum ada rekanan. Tambahkan klien/rekanan di modul CRM, lalu tandai rekanan pada baris jurnal supaya transaksinya terekap di sini." />
      ) : (
        <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
              <tr>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tl-[14px]">Rekanan</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Tipe</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Biaya / HPP</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Pendapatan</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Piutang</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Hutang</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Uang Muka Terbuka</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">DP Terbuka</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Baris</th>
                <th className="sticky right-0 z-10 bg-[#FAF1E5] text-right px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tr-[14px]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const idle = r.lines === 0 && r.uangMuka === 0 && r.dp === 0;
                return (
                  <tr key={r.id} className={`border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors ${idle ? "opacity-55" : ""}`}>
                    <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.partnerType === "pemasok" ? "dusty-rose" : r.partnerType === "keduanya" ? "powder-blue" : "sage"}>
                        {r.partnerType === "pemasok" ? "Pemasok" : r.partnerType === "keduanya" ? "Keduanya" : "Klien"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{r.biaya ? formatMoney(r.biaya) : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{r.pendapatan ? formatMoney(r.pendapatan) : "—"}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${r.piutang ? "font-semibold text-sage-deep" : ""}`}>{r.piutang ? formatMoney(r.piutang) : "—"}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${r.hutang ? "font-semibold text-destructive" : ""}`}>{r.hutang ? formatMoney(r.hutang) : "—"}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${r.uangMuka ? "font-semibold text-ink" : ""}`}>{r.uangMuka ? formatMoney(r.uangMuka) : "—"}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${r.dp ? "font-semibold text-ink" : ""}`}>{r.dp ? formatMoney(r.dp) : "—"}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">{r.lines}</td>
                    <td className="sticky right-0 z-10 bg-surface px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_10px_-8px_rgba(59,51,44,0.18)]">
                      <Link href={`/${companySlug}/keuangan/kartu-rekanan/${r.id}`} className="text-[13px] font-semibold text-sage-deep hover:underline">
                        Lihat Kartu
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
