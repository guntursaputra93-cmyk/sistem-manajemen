import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, journalEntryLines, chartOfAccounts, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { openItemTriggerSide } from "@/lib/finance/openItems";
import { ManualJournalForm } from "./ManualJournalForm";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function NewJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; corrects?: string }>;
}) {
  const { companySlug } = await params;
  const { error, corrects } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`/${companySlug}/keuangan/jurnal`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const postingAccounts = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false), eq(chartOfAccounts.isActive, true)))
      .orderBy(asc(chartOfAccounts.code))
  );
  const accounts = postingAccounts.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }));
  // Akun transaksi terbuka + sisi pemicunya (uang muka = debet, DP diterima = kredit).
  const openItemAccounts = postingAccounts
    .filter((a) => a.isOpenItem)
    .map((a) => ({ id: a.id, side: openItemTriggerSide(a.openItemType) }));

  // Rekanan/klien CRM untuk menautkan transaksi terbuka (Item 5a).
  const orgRows = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, partnerType: organizations.partnerType })
      .from(organizations)
      .where(eq(organizations.companyId, company.id))
      .orderBy(asc(organizations.name))
  );
  // Tipe ikut di label supaya staf tidak salah pilih klien vs pemasok.
  const orgList = orgRows.map((o) => ({
    id: o.id,
    name: o.partnerType === "klien" ? o.name : `${o.name} · ${o.partnerType === "pemasok" ? "Pemasok" : "Klien+Pemasok"}`,
  }));

  // Prefill koreksi: hanya dari jurnal yang sudah di-void (pola createCorrectionEntry lama).
  let correctsEntryId: string | undefined;
  let correctsLabel: string | undefined;
  let initialRows: { accountId: string; debit: string; credit: string }[] | undefined;
  let initialDescription: string | undefined;
  if (corrects) {
    const [source] = await withTenantContext(tenantContext, (tx) =>
      tx.select().from(journalEntries).where(and(eq(journalEntries.id, corrects), eq(journalEntries.companyId, company.id)))
    );
    if (source && source.status === "void") {
      const already = await withTenantContext(tenantContext, (tx) =>
        tx.select().from(journalEntries).where(eq(journalEntries.correctsEntryId, source.id))
      );
      if (already.length === 0) {
        const srcLines = await withTenantContext(tenantContext, (tx) =>
          tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, source.id)).orderBy(asc(journalEntryLines.lineOrder))
        );
        correctsEntryId = source.id;
        correctsLabel = source.entryNumber ?? source.id;
        initialDescription = `Koreksi atas ${source.entryNumber ?? source.id}`;
        initialRows = srcLines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debitAmount) > 0 ? String(Number(l.debitAmount)) : "",
          credit: Number(l.creditAmount) > 0 ? String(Number(l.creditAmount)) : "",
        }));
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum", href: `/${companySlug}/keuangan/jurnal` },
          { label: correctsEntryId ? "Jurnal Koreksi" : "Jurnal Baru" },
        ]}
        title={correctsEntryId ? "Jurnal Koreksi" : "Jurnal Manual"}
        description="Isi semua baris debit/kredit sekaligus — jurnal langsung diposting saat disimpan (tidak ada draft)."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>
      )}

      <Card title={correctsEntryId ? "Detail Jurnal Koreksi" : "Detail Jurnal"}>
        <ManualJournalForm
          companySlug={companySlug}
          companyId={company.id}
          accounts={accounts}
          openItemAccounts={openItemAccounts}
          organizations={orgList}
          defaultDate={today}
          correctsEntryId={correctsEntryId}
          correctsLabel={correctsLabel}
          initialRows={initialRows}
          initialDescription={initialDescription}
        />
      </Card>
    </div>
  );
}
