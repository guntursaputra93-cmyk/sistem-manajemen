import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, chartOfAccounts, openItems, openItemSettlements, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { SettleOpenItemForm } from "./SettleOpenItemForm";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatRupiah as formatMoney } from "@/lib/finance/format";

const TYPE_LABEL: Record<string, string> = { uang_muka: "Uang Muka", dp_diterima: "DP Diterima", lainnya: "Lainnya" };
const STATUS_LABEL: Record<string, string> = { terbuka: "Terbuka", sebagian: "Sebagian", selesai: "Selesai" };

export default async function SettleOpenItemPage({
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

  if (!hasPermission(session.user.role, "VIEW_JOURNAL_ENTRIES")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [item] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(openItems).where(and(eq(openItems.id, id), eq(openItems.companyId, company.id)))
  );
  if (!item) notFound();

  const [[control], [opening], postingAccounts, settlements] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, item.controlAccountId))),
    withTenantContext(tenantContext, (tx) => tx.select().from(journalEntries).where(eq(journalEntries.id, item.openingEntryId))),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false), eq(chartOfAccounts.isActive, true)))
        .orderBy(asc(chartOfAccounts.code))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ settlement: openItemSettlements, journal: journalEntries })
        .from(openItemSettlements)
        .innerJoin(journalEntries, eq(journalEntries.id, openItemSettlements.journalEntryId))
        .where(eq(openItemSettlements.openItemId, item.id))
        .orderBy(desc(openItemSettlements.createdAt))
    ),
  ]);

  const [org] = item.organizationId
    ? await withTenantContext(tenantContext, (tx) =>
        tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, item.organizationId!))
      )
    : [];

  const remaining = Number(item.openingAmount) - Number(item.settledAmount);
  // Baris lawan diisi di sisi saldo normal akun kontrol; akun kontrol dibersihkan
  // di sisi sebaliknya (dihitung otomatis di lib/finance/openItems.settleOpenItem).
  const counterSideLabel = control?.normalBalance === "debit" ? "Debit" : "Kredit";
  // Akun kontrol tidak boleh jadi baris lawan (itu leg yang di-generate otomatis).
  const counterAccounts = postingAccounts.filter((a) => a.id !== item.controlAccountId).map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum", href: `/${companySlug}/keuangan/jurnal` },
          { label: "Transaksi Terbuka" },
        ]}
        title={item.description}
        description={`${TYPE_LABEL[item.type] ?? item.type}${org ? ` · rekanan ${org.name}` : ""} · akun kontrol ${control?.code} · ${control?.name}`}
      />

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>}
      {success && <div className="rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">Berhasil disimpan.</div>}

      <Card title="Ringkasan">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Status</div>
            <div className="mt-1">
              <Badge variant={item.status === "selesai" ? "sage" : item.status === "sebagian" ? "powder-blue" : "dusty-rose"}>{STATUS_LABEL[item.status] ?? item.status}</Badge>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Nilai Awal</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(item.openingAmount)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Sudah Diselesaikan</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(item.settledAmount)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Sisa</div>
            <div className="mt-1 font-semibold text-ink">{formatMoney(remaining)}</div>
          </div>
        </div>
        {opening && (
          <p className="mt-3 text-xs text-ink-muted">
            Jurnal pembuka:{" "}
            <Link href={`/${companySlug}/keuangan/jurnal/${opening.id}`} className="text-sage-deep hover:underline">
              {opening.entryNumber ?? "(jurnal)"}
            </Link>
            {item.dueDate ? ` · jatuh tempo ${new Date(item.dueDate).toLocaleDateString("id-ID")}` : ""}
          </p>
        )}
      </Card>

      {settlements.length > 0 && (
        <Card title="Riwayat Penyelesaian">
          <ul className="divide-y divide-ink-muted/10 text-[13px]">
            {settlements.map((s) => (
              <li key={s.settlement.id} className="flex items-center justify-between py-2">
                <Link href={`/${companySlug}/keuangan/jurnal/${s.journal.id}`} className="text-sage-deep hover:underline">
                  {s.journal.entryNumber ?? "(jurnal)"}
                </Link>
                <span className="text-ink">{formatMoney(s.settlement.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {item.status === "selesai" ? (
        <Card title="Selesai">
          <p className="text-[13px] text-ink-muted">Transaksi terbuka ini sudah selesai — akun kontrol sudah lunas.</p>
        </Card>
      ) : canManage ? (
        <Card title="Selesaikan Transaksi">
          <SettleOpenItemForm
            companySlug={companySlug}
            companyId={company.id}
            openItemId={item.id}
            accounts={counterAccounts}
            defaultDate={today}
            defaultDescription={`Penyelesaian: ${item.description}`}
            remaining={remaining}
            counterSideLabel={counterSideLabel}
            controlLabel={`${control?.code} · ${control?.name}`}
          />
        </Card>
      ) : null}
    </div>
  );
}
