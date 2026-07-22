import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, depreciationRuns, journalEntries, fixedAssets } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { runDepreciationAction } from "../actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";

const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function DepreciationRunsPage({
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

  if (!hasPermission(session.user.role, "VIEW_FIXED_ASSETS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_FIXED_ASSETS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [runList, activeAssetCount] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ run: depreciationRuns, entry: journalEntries })
        .from(depreciationRuns)
        .innerJoin(journalEntries, eq(journalEntries.id, depreciationRuns.journalEntryId))
        .where(eq(depreciationRuns.companyId, company.id))
        .orderBy(desc(depreciationRuns.periodYear), desc(depreciationRuns.periodMonth))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(fixedAssets).where(eq(fixedAssets.companyId, company.id))).then(
      (rows) => rows.filter((a) => a.status === "aktif").length
    ),
  ]);

  const today = new Date();

  const columns: DataTableColumn<(typeof runList)[number]>[] = [
    { key: "period", header: "Periode", render: (r) => `${MONTH_LABEL[r.run.periodMonth - 1]} ${r.run.periodYear}` },
    {
      key: "journal",
      header: "No. Jurnal",
      render: (r) => (
        <Link href={`/${companySlug}/keuangan/jurnal/${r.entry.id}`} className="text-sage-deep hover:underline">
          {r.entry.entryNumber ?? "-"}
        </Link>
      ),
    },
    { key: "runAt", header: "Dijalankan", render: (r) => new Date(r.run.runAt).toLocaleString("id-ID") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Aset Tetap", href: `/${companySlug}/keuangan/aset-tetap` },
          { label: "Penyusutan" },
        ]}
        title="Penyusutan Aset Tetap"
        description={`${company.name} — ${activeAssetCount} aset berstatus aktif.`}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil dijalankan.</div>}

      {canManage && (
        <Card
          title="Jalankan Penyusutan"
          description="Memproses SEMUA aset berstatus aktif sekaligus dalam 1 jurnal gabungan. Periode yang sama tidak bisa dijalankan 2x."
        >
          <form action={runDepreciationAction} className="flex items-end gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Bulan</label>
              <select name="periodMonth" defaultValue={today.getMonth() + 1} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {MONTH_LABEL.map((label, idx) => (
                  <option key={label} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
              <input autoComplete="off" name="periodYear" type="number" defaultValue={today.getFullYear()} className="w-24 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Jalankan Penyusutan
            </button>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={runList} rowKey={(r) => r.run.id} emptyMessage="Belum pernah ada penyusutan dijalankan." />
    </div>
  );
}
