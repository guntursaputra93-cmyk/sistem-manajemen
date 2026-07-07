import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, documentCategories, documents, documentAccessRules } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addDocumentAccessRule, deleteDocumentAccessRule } from "./actions";

const SCOPE_LABEL: Record<string, string> = {
  semua_staf: "Semua Staf",
  departemen_tertentu: "Departemen Tertentu",
  role_tertentu: "Role Tertentu",
};

export default async function DocumentAccessRulesPage({
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

  if (!hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [rules, categories, docList, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(documentAccessRules).where(eq(documentAccessRules.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(documentCategories).where(eq(documentCategories.companyId, company.id)).orderBy(asc(documentCategories.hierarchyLevel))),
    withTenantContext(tenantContext, (tx) => tx.select().from(documents).where(eq(documents.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id))),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Jenjang Akses Dokumen</h1>
        <p className="text-gray-500 text-sm mt-1">
          <strong>Default: tanpa rule, semua staf perusahaan bisa lihat.</strong> Tambah rule di sini kalau mau
          membatasi kategori/dokumen tertentu.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Tambah Rule</h2>
        <form action={addDocumentAccessRule} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
              <input type="radio" name="targetMode" value="category" defaultChecked /> Kategori Dokumen
            </label>
            <select name="documentCategoryId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
              <input type="radio" name="targetMode" value="document" /> Dokumen Spesifik (override)
            </label>
            <select name="documentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- pilih dokumen --</option>
              {docList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Scope</label>
            <select name="scope" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
              <option value="semua_staf">Semua Staf</option>
              <option value="departemen_tertentu">Departemen Tertentu</option>
              <option value="role_tertentu">Role Tertentu</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Departemen (kalau scope departemen)</label>
            <select name="departmentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role (kalau scope role)</label>
            <select name="role" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- tidak ada --</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="department_head">Kepala Departemen</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Tambah Rule
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Target</th>
              <th className="text-left px-4 py-2">Scope</th>
              <th className="text-left px-4 py-2">Detail</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada rule — semua staf bisa lihat semua dokumen.
                </td>
              </tr>
            )}
            {rules.map((rule) => {
              const category = categories.find((c) => c.id === rule.documentCategoryId);
              const doc = docList.find((d) => d.id === rule.documentId);
              const department = deptList.find((d) => d.id === rule.departmentId);
              return (
                <tr key={rule.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{category ? `Kategori: ${category.name}` : `Dokumen: ${doc?.title ?? "?"}`}</td>
                  <td className="px-4 py-2">{SCOPE_LABEL[rule.scope]}</td>
                  <td className="px-4 py-2">{department?.name ?? (rule.role ? ROLE_LABEL[rule.role as keyof typeof ROLE_LABEL] : "-")}</td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteDocumentAccessRule}>
                      <input type="hidden" name="companySlug" value={companySlug} />
                      <input type="hidden" name="id" value={rule.id} />
                      <button type="submit" className="text-red-500 hover:underline text-xs">
                        Hapus
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
