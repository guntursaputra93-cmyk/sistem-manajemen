import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, documentCategories, documents, documentAccessRules } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addDocumentAccessRule, deleteDocumentAccessRule } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

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

  const columns: DataTableColumn<(typeof rules)[number]>[] = [
    {
      key: "target",
      header: "Target",
      render: (rule) => {
        const category = categories.find((c) => c.id === rule.documentCategoryId);
        const doc = docList.find((d) => d.id === rule.documentId);
        return category ? `Kategori: ${category.name}` : `Dokumen: ${doc?.title ?? "?"}`;
      },
    },
    { key: "scope", header: "Scope", render: (rule) => SCOPE_LABEL[rule.scope] },
    {
      key: "detail",
      header: "Detail",
      render: (rule) => {
        const department = deptList.find((d) => d.id === rule.departmentId);
        return department?.name ?? (rule.role ? ROLE_LABEL[rule.role as keyof typeof ROLE_LABEL] : "-");
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (rule) => (
        <form action={deleteDocumentAccessRule}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="id" value={rule.id} />
          <button type="submit" className="text-destructive hover:underline text-xs">
            Hapus
          </button>
        </form>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Jenjang Akses Dokumen</h1>
        <p className="text-sm text-ink-muted mt-1">
          <strong>Default: tanpa rule, semua staf perusahaan bisa lihat.</strong> Tambah rule di sini kalau mau membatasi kategori/dokumen tertentu.
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Rule">
        <form action={addDocumentAccessRule} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1">
              <input type="radio" name="targetMode" value="category" defaultChecked className="accent-sage-deep" /> Kategori Dokumen
            </label>
            <select
              name="documentCategoryId"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1">
              <input type="radio" name="targetMode" value="document" className="accent-sage-deep" /> Dokumen Spesifik (override)
            </label>
            <select
              name="documentId"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="">-- pilih dokumen --</option>
              {docList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Scope</label>
            <select
              name="scope"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              required
            >
              <option value="semua_staf">Semua Staf</option>
              <option value="departemen_tertentu">Departemen Tertentu</option>
              <option value="role_tertentu">Role Tertentu</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Departemen (kalau scope departemen)</label>
            <select
              name="departmentId"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Role (kalau scope role)</label>
            <select
              name="role"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="">-- tidak ada --</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="department_head">Kepala Departemen</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div className="col-span-full">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tambah Rule
            </button>
          </div>
        </form>
      </Card>

      <DataTable columns={columns} rows={rules} rowKey={(rule) => rule.id} emptyMessage="Belum ada rule — semua staf bisa lihat semua dokumen." />
    </div>
  );
}
