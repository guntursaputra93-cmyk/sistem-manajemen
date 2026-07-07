import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentCategories, documents, documentVersions, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { canViewDocument } from "@/lib/documents/access";
import { requireModuleEnabled } from "@/lib/modules";
import { createDocument } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "Sedang Direview",
  active: "Aktif",
  superseded: "Digantikan",
  expired: "Kedaluwarsa",
};

export default async function DokumenPage({
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

  if (!hasPermission(session.user.role, "VIEW_DOCUMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen", companySlug }));

  // Lazy expire-on-read: sesuai keputusan, cek tiap kali halaman dibuka, tidak pakai cron.
  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const [allDocs, categories, versions, selfUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(documents).where(eq(documents.companyId, company.id)).orderBy(desc(documents.createdAt))),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(documentCategories).where(eq(documentCategories.companyId, company.id)).orderBy(asc(documentCategories.hierarchyLevel))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(documentVersions).where(eq(documentVersions.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
  ]);

  const viewer = { role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibility = await withTenantContext(tenantContext, (tx) =>
    Promise.all(allDocs.map((doc) => canViewDocument(tx, { companyId: company.id, documentId: doc.id, categoryId: doc.categoryId, viewer })))
  );
  const docList = allDocs.filter((_, i) => visibility[i]);

  const canCreate = hasPermission(session.user.role, "CREATE_DOCUMENT");

  function latestVersionOf(documentId: string) {
    const versionsForDoc = versions.filter((v) => v.documentId === documentId);
    return versionsForDoc.find((v) => v.status === "active") ?? versionsForDoc.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dokumen Perusahaan</h1>
        <p className="text-gray-500 text-sm mt-1">Peraturan Perusahaan, SK Direktur, dan dokumen lain — dengan versioning.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      {canCreate && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Buat Dokumen Baru</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Belum ada kategori dokumen. Admin perlu atur dulu di{" "}
              <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className="text-blue-600 hover:underline">
                Pengaturan &rarr; Kategori Dokumen
              </Link>
              .
            </p>
          ) : (
            <form action={createDocument} className="grid grid-cols-2 gap-4">
              <input type="hidden" name="companySlug" value={companySlug} />
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Judul</label>
                <input name="title" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
                <select name="categoryId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Efektif (opsional)</label>
                <input name="effectiveDate" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Berlaku Sampai (opsional)</label>
                <input name="expiresAt" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                  Buat Dokumen (Draft Versi 1)
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Judul</th>
              <th className="text-left px-4 py-2">Kategori</th>
              <th className="text-left px-4 py-2">Versi Terbaru</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {docList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada dokumen.
                </td>
              </tr>
            )}
            {docList.map((doc) => {
              const category = categories.find((c) => c.id === doc.categoryId);
              const version = latestVersionOf(doc.id);
              return (
                <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/${companySlug}/dokumen/${doc.id}`} className="text-blue-600 hover:underline">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{category?.name ?? "-"}</td>
                  <td className="px-4 py-2">{version ? `v${version.versionNumber}` : "-"}</td>
                  <td className="px-4 py-2">{version ? STATUS_LABEL[version.status] ?? version.status : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
