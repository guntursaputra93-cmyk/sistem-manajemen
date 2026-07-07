import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentCategories } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { addDocumentCategory, deleteDocumentCategory } from "./actions";

export default async function DocumentCategoriesPage({
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

  if (!hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const categories = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(documentCategories).where(eq(documentCategories.companyId, company.id)).orderBy(asc(documentCategories.hierarchyLevel), asc(documentCategories.code))
  );

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Kategori Dokumen</h1>
        <p className="text-gray-500 text-sm mt-1">
          Kode kategori baku (mis. PP, SK, KTR). Kode ini juga jadi acuan jenjang approval dokumen di
          halaman Jenjang Approval.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Tambah Kategori</h2>
        <form action={addDocumentCategory} className="grid grid-cols-3 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kode</label>
            <input name="code" required maxLength={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
            <input name="name" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hierarchy Level</label>
            <input name="hierarchyLevel" type="number" min={1} defaultValue={1} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Tambah
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Kode</th>
              <th className="text-left px-4 py-2">Nama</th>
              <th className="text-left px-4 py-2">Level</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada kategori.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{c.code}</td>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{c.hierarchyLevel}</td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteDocumentCategory}>
                    <input type="hidden" name="companySlug" value={companySlug} />
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-red-500 hover:underline text-xs">
                      Hapus
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
