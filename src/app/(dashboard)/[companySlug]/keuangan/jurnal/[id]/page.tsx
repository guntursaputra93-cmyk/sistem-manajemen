import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, journalEntryLines, chartOfAccounts, openItems } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { voidJournalEntryAction } from "../actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatRupiah as formatMoney } from "@/lib/finance/format";

export default async function JournalEntryDetailPage({
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

  const [entry] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.companyId, company.id)))
  );
  if (!entry) notFound();

  const [lines, correctionOf, correctedBy, openedItem] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ line: journalEntryLines, account: chartOfAccounts })
        .from(journalEntryLines)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .where(eq(journalEntryLines.journalEntryId, entry.id))
        .orderBy(asc(journalEntryLines.lineOrder))
    ),
    entry.correctsEntryId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(journalEntries).where(eq(journalEntries.id, entry.correctsEntryId!)))
      : Promise.resolve([] as (typeof journalEntries.$inferSelect)[]),
    withTenantContext(tenantContext, (tx) => tx.select().from(journalEntries).where(eq(journalEntries.correctsEntryId, entry.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(openItems).where(eq(openItems.openingEntryId, entry.id))),
  ]);

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.line.debitAmount), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.line.creditAmount), 0);
  const balanceDiff = totalDebit - totalCredit;
  const isBalanced = Math.abs(balanceDiff) < 0.005 && totalDebit > 0;

  // Jurnal baru selalu langsung posted (tidak ada draft) — trail 2 langkah:
  // Dibuat → Posted (atau Void).
  const trailSteps: TrailStep[] = [
    { id: "created", label: "Dibuat", status: "done" },
    entry.status === "void"
      ? { id: "posted", label: "Posted", caption: "Dibatalkan (void)", description: entry.voidReason ?? undefined, status: "rejected" }
      : {
          id: "posted",
          label: "Posted",
          caption: entry.postedAt ? new Date(entry.postedAt).toLocaleDateString("id-ID") : undefined,
          status: entry.status === "posted" ? "done" : "pending",
        },
  ];

  const lineColumns: DataTableColumn<(typeof lines)[number]>[] = [
    { key: "account", header: "Akun", render: (l) => `${l.account.code} · ${l.account.name}` },
    { key: "description", header: "Keterangan", render: (l) => l.line.description ?? "-" },
    { key: "debit", header: "Debit", render: (l) => (Number(l.line.debitAmount) > 0 ? formatMoney(l.line.debitAmount) : "-"), className: "text-right" },
    { key: "credit", header: "Kredit", render: (l) => (Number(l.line.creditAmount) > 0 ? formatMoney(l.line.creditAmount) : "-"), className: "text-right" },
  ];

  const item = openedItem[0];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum", href: `/${companySlug}/keuangan/jurnal` },
          { label: entry.entryNumber ?? "Jurnal" },
        ]}
        title={entry.entryNumber ?? "Jurnal"}
        description={entry.description}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Status Jurnal">
        <TrailStepper orientation="horizontal" steps={trailSteps} />
        {correctionOf[0] && (
          <p className="text-xs text-ink-muted mt-3">
            Jurnal koreksi atas{" "}
            <Link href={`/${companySlug}/keuangan/jurnal/${correctionOf[0].id}`} className="text-sage-deep hover:underline">
              {correctionOf[0].entryNumber ?? correctionOf[0].id}
            </Link>
            .
          </p>
        )}
        {correctedBy[0] && (
          <p className="text-xs text-ink-muted mt-1">
            Sudah dikoreksi oleh{" "}
            <Link href={`/${companySlug}/keuangan/jurnal/${correctedBy[0].id}`} className="text-sage-deep hover:underline">
              {correctedBy[0].entryNumber ?? correctedBy[0].id}
            </Link>
            .
          </p>
        )}
        {item && (
          <p className="text-xs text-ink-muted mt-1">
            Membuka transaksi terbuka{" "}
            <Link href={`/${companySlug}/keuangan/jurnal/transaksi-terbuka/${item.id}`} className="text-sage-deep hover:underline">
              {item.description}
            </Link>{" "}
            — status {item.status}, sisa {formatMoney(Number(item.openingAmount) - Number(item.settledAmount))}.
          </p>
        )}
      </Card>

      <Card
        title="Baris Jurnal"
        description={`Total debit ${formatMoney(totalDebit)} · Total kredit ${formatMoney(totalCredit)}${
          totalDebit || totalCredit ? ` · Selisih ${formatMoney(Math.abs(balanceDiff))}${isBalanced ? " (balance)" : ""}` : ""
        }`}
      >
        <DataTable columns={lineColumns} rows={lines} rowKey={(l) => l.line.id} emptyMessage="Tidak ada baris jurnal." />
      </Card>

      {entry.status === "posted" && canManage && (
        <Card title="Void Jurnal" description="Jurnal posted tidak bisa diedit — satu-satunya cara membatalkan adalah void, lalu buat jurnal koreksi baru.">
          <form action={voidJournalEntryAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="journalEntryId" value={entry.id} />
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Alasan Pembatalan</label>
              <input autoComplete="off" name="voidReason" required placeholder="mis. Salah akun, seharusnya ke 61201" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <button type="submit" className="bg-destructive hover:bg-destructive/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                Void Jurnal
              </button>
            </div>
          </form>
        </Card>
      )}

      {entry.status === "void" && canManage && !correctedBy[0] && (
        <Card title="Jurnal Koreksi" description={`Dibatalkan: ${entry.voidReason ?? "-"}`}>
          <p className="mb-3 text-[13px] text-ink-muted">Buat jurnal koreksi baru (langsung diposting) untuk mengganti jurnal yang dibatalkan ini.</p>
          <Link
            href={`/${companySlug}/keuangan/jurnal/baru?corrects=${entry.id}`}
            className="inline-flex bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]"
          >
            Buat Jurnal Koreksi
          </Link>
        </Card>
      )}
    </div>
  );
}
