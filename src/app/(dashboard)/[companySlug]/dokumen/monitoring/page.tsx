import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { getDashboardSettings, getActiveDocumentCountByCategory, getAttentionItems, getAccessStatistics } from "@/lib/dashboard/monitoring";
import { updateDashboardSettings } from "./actions";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

const REASON_LABEL: Record<string, string> = {
  in_review_lama: "Sedang direview kelamaan",
  menunggu_approval_lama: "Menunggu approval kelamaan",
  draft_mangkrak: "Draft mangkrak",
  mendekati_kedaluwarsa: "Mendekati kedaluwarsa",
};

export default async function MonitoringPage({
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

  if (!hasPermission(session.user.role, "VIEW_DASHBOARD_MONITORING")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const canManageSettings = hasPermission(session.user.role, "MANAGE_DASHBOARD_SETTINGS");

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  // Halaman ini menampilkan data modul Pengendalian Dokumen (jumlah dokumen per
  // kategori, item perlu perhatian, statistik akses) — jadi harus ikut ter-gate modul,
  // sama seperti dokumen/page.tsx. Sebelumnya guard ini absen sehingga halaman tetap
  // memuat data meski modulnya dimatikan untuk company tersebut.
  await withTenantContext(tenantContext, (tx) =>
    requireModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen", companySlug })
  );

  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const settings = await withTenantContext(tenantContext, (tx) => getDashboardSettings(tx, company.id));

  const [categoryCounts, attentionItems, accessStats] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getActiveDocumentCountByCategory(tx, company.id)),
    withTenantContext(tenantContext, (tx) => getAttentionItems(tx, company.id, settings)),
    withTenantContext(tenantContext, (tx) => getAccessStatistics(tx, company.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Persuratan" },
          { label: "Dokumen", href: `/${companySlug}/dokumen` },
          { label: "Monitoring" },
        ]}
        title="Dashboard Pemantauan"
        description={`Monitoring dokumen & surat untuk ${company.name}.`}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <Card title="Dokumen Aktif per Kategori">
        {categoryCounts.length === 0 ? (
          <p className="text-[11px] text-ink-muted italic">Belum ada kategori dokumen.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categoryCounts.map((c) => (
              <li key={c.categoryId} className="flex justify-between text-[11px] border-b border-ink-muted/10 pb-2">
                <span className="text-ink">{c.categoryName}</span>
                <span className="font-bold text-ink">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Butuh Perhatian"
        action={
          <span className="text-[10px] text-ink-muted whitespace-nowrap">
            Ambang: {settings.stalledThresholdDays} hari macet, {settings.expiryWarningDays} hari sebelum kedaluwarsa
          </span>
        }
      >
        {attentionItems.length === 0 ? (
          <p className="text-[11px] text-ink-muted italic">Tidak ada yang butuh perhatian saat ini.</p>
        ) : (
          <ul className="space-y-2">
            {attentionItems.map((item) => (
              <li key={`${item.kind}-${item.id}-${item.reason}`} className="flex justify-between text-[11px] border-b border-ink-muted/10 pb-2 last:border-0 last:pb-0">
                <span className="text-ink">
                  [{item.kind === "dokumen" ? "Dokumen" : "Surat"}] {item.title}
                </span>
                <span className="text-ink-muted">{REASON_LABEL[item.reason]}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Statistik Akses Dokumen">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-[10px] font-semibold text-ink-muted mb-2 uppercase tracking-wide">Paling Sering Dibaca</h3>
            {accessStats.mostRead.length === 0 ? (
              <p className="text-[11px] text-ink-muted italic">Belum ada data.</p>
            ) : (
              <ol className="space-y-1">
                {accessStats.mostRead.map((s) => (
                  <li key={s.documentVersionId} className="flex justify-between text-[11px]">
                    <span className="text-ink">{s.title}</span>
                    <span className="text-ink-muted">{s.viewCount}x</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-[10px] font-semibold text-ink-muted mb-2 uppercase tracking-wide">Paling Jarang Dibaca</h3>
            {accessStats.leastRead.length === 0 ? (
              <p className="text-[11px] text-ink-muted italic">Belum ada data.</p>
            ) : (
              <ol className="space-y-1">
                {accessStats.leastRead.map((s) => (
                  <li key={s.documentVersionId} className="flex justify-between text-[11px]">
                    <span className="text-ink">{s.title}</span>
                    <span className="text-ink-muted">{s.viewCount}x</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Card>

      {canManageSettings && (
        <Card title="Ambang Waktu Dashboard">
          <form action={updateDashboardSettings} className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Macet (hari)</label>
              <input autoComplete="off"
                name="stalledThresholdDays"
                type="number"
                min={1}
                defaultValue={settings.stalledThresholdDays}
                className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base w-20"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Peringatan Kedaluwarsa (hari)</label>
              <input autoComplete="off"
                name="expiryWarningDays"
                type="number"
                min={1}
                defaultValue={settings.expiryWarningDays}
                className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base w-20"
              />
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Edit
            </button>
          </form>
        </Card>
      )}

      <p className="text-[11px] text-ink-muted">
        Lihat detail lengkap surat &amp; dokumen di halaman{" "}
        <Link href={`/${companySlug}/arsip`} className="text-sage-deep hover:underline">
          Arsip
        </Link>
        .
      </p>
    </div>
  );
}
