import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createJournalEntry } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", posted: "Posted", void: "Void" };
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  draft: "powder-blue",
  posted: "sage",
  void: "destructive",
};

export default async function JournalEntriesPage({
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

  const entryList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(journalEntries).where(eq(journalEntries.companyId, company.id)).orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
  );

  const columns: DataTableColumn<(typeof entryList)[number]>[] = [
    {
      key: "number",
      header: "Nomor",
      render: (e) => (
        <Link href={`/${companySlug}/keuangan/jurnal/${e.id}`} className="font-medium text-sage-deep hover:underline">
          {e.entryNumber ?? "(draft)"}
        </Link>
      ),
    },
    { key: "date", header: "Tanggal", render: (e) => new Date(e.entryDate).toLocaleDateString("id-ID") },
    { key: "description", header: "Keterangan", render: (e) => e.description },
    { key: "status", header: "Status", render: (e) => <Badge variant={STATUS_VARIANT[e.status] ?? "powder-blue"}>{STATUS_LABEL[e.status] ?? e.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Jurnal Umum</h1>
        <p className="text-sm text-ink-muted mt-1">Riwayat jurnal {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Buat Jurnal Baru" description="Jurnal dibuat sebagai draft dulu — isi baris debit/kredit di halaman berikutnya, nomor jurnal baru muncul setelah diposting.">
          <form action={createJournalEntry} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal</label>
              <input autoComplete="off" name="entryDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Keterangan</label>
              <input autoComplete="off" name="description" required placeholder="mis. Pembayaran sewa kantor Juli 2026" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="lg:col-span-3">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Buat Draft
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={entryList} rowKey={(e) => e.id} emptyMessage="Belum ada jurnal." />
    </div>
  );
}
