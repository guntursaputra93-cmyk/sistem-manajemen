import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { getDashboardSettings, getActiveDocumentCountByCategory, getAttentionItems, getAccessStatistics } from "@/lib/dashboard/monitoring";
import { updateDashboardSettings } from "./actions";

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

  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const settings = await withTenantContext(tenantContext, (tx) => getDashboardSettings(tx, company.id));

  const [categoryCounts, attentionItems, accessStats] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getActiveDocumentCountByCategory(tx, company.id)),
    withTenantContext(tenantContext, (tx) => getAttentionItems(tx, company.id, settings)),
    withTenantContext(tenantContext, (tx) => getAccessStatistics(tx, company.id)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/${companySlug}/dokumen`} className="text-sm text-blue-600 hover:underline">
          &larr; Kembali ke Dokumen
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Dashboard Pemantauan</h1>
        <p className="text-gray-500 text-sm mt-1">Monitoring dokumen &amp; surat untuk {company.name}.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Dokumen Aktif per Kategori</h2>
        {categoryCounts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Belum ada kategori dokumen.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {categoryCounts.map((c) => (
              <li key={c.categoryId} className="flex justify-between border-b border-gray-100 pb-2">
                <span>{c.categoryName}</span>
                <span className="font-semibold text-gray-900">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Butuh Perhatian</h2>
          <span className="text-xs text-gray-400">
            Ambang: {settings.stalledThresholdDays} hari macet, {settings.expiryWarningDays} hari sebelum kedaluwarsa
          </span>
        </div>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Tidak ada yang butuh perhatian saat ini.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {attentionItems.map((item) => (
              <li key={`${item.kind}-${item.id}-${item.reason}`} className="flex justify-between border-b border-gray-100 pb-2">
                <span>
                  [{item.kind === "dokumen" ? "Dokumen" : "Surat"}] {item.title}
                </span>
                <span className="text-gray-500">{REASON_LABEL[item.reason]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Statistik Akses Dokumen</h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="text-xs font-medium text-gray-500 mb-2">Paling Sering Dibaca</h3>
            {accessStats.mostRead.length === 0 ? (
              <p className="text-gray-400 italic">Belum ada data.</p>
            ) : (
              <ol className="space-y-1">
                {accessStats.mostRead.map((s) => (
                  <li key={s.documentVersionId} className="flex justify-between">
                    <span>{s.title}</span>
                    <span className="text-gray-500">{s.viewCount}x</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500 mb-2">Paling Jarang Dibaca</h3>
            {accessStats.leastRead.length === 0 ? (
              <p className="text-gray-400 italic">Belum ada data.</p>
            ) : (
              <ol className="space-y-1">
                {accessStats.leastRead.map((s) => (
                  <li key={s.documentVersionId} className="flex justify-between">
                    <span>{s.title}</span>
                    <span className="text-gray-500">{s.viewCount}x</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      {canManageSettings && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Ambang Waktu Dashboard</h2>
          <form action={updateDashboardSettings} className="flex items-end gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Macet (hari)</label>
              <input
                name="stalledThresholdDays"
                type="number"
                min={1}
                defaultValue={settings.stalledThresholdDays}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Peringatan Kedaluwarsa (hari)</label>
              <input
                name="expiryWarningDays"
                type="number"
                min={1}
                defaultValue={settings.expiryWarningDays}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Simpan
            </button>
          </form>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Lihat detail lengkap surat &amp; dokumen di halaman{" "}
        <Link href={`/${companySlug}/arsip`} className="text-blue-600 hover:underline">
          Arsip
        </Link>
        .
      </p>
    </div>
  );
}
