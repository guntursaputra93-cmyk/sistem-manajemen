import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, documentCategories, documents, documentAccessRules } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addDocumentAccessRule, deleteDocumentAccessRule } from "./actions";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
      <PageHeader
        breadcrumb={[{ label: "Pengaturan" }, { label: "Jenjang Akses Dokumen" }]}
        title="Jenjang Akses Dokumen"
        description={
          <>
            <strong>Default: tanpa rule, semua staf perusahaan bisa lihat.</strong> Tambah rule di sini kalau mau membatasi kategori/dokumen tertentu.
          </>
        }
      />

      <div className="mb-4 flex justify-end">
        <FormDrawer buttonLabel="Tambah Rule" title="Tambah Rule Akses" defaultOpen={Boolean(error)}>
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
              {error}
            </div>
          )}
          <form action={addDocumentAccessRule}>
            <input type="hidden" name="companySlug" value={companySlug} />
            <FormSection title="① Target Rule">
              <FormField label="" full>
                <label className="flex items-center gap-2 text-[13px] font-semibold text-ink mb-1.5">
                  <input type="radio" name="targetMode" value="category" defaultChecked className="accent-peach-deep" /> Kategori Dokumen
                </label>
                <select name="documentCategoryId" className={inputClass}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="" full>
                <label className="flex items-center gap-2 text-[13px] font-semibold text-ink mb-1.5">
                  <input type="radio" name="targetMode" value="document" className="accent-peach-deep" /> Dokumen Spesifik (override)
                </label>
                <select name="documentId" className={inputClass}>
                  <option value="">-- pilih dokumen --</option>
                  {docList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </FormField>
            </FormSection>
            <FormSection title="② Siapa yang Boleh Lihat">
              <FormField label="Scope *" full>
                <select name="scope" className={inputClass} required>
                  <option value="semua_staf">Semua Staf</option>
                  <option value="departemen_tertentu">Departemen Tertentu</option>
                  <option value="role_tertentu">Role Tertentu</option>
                </select>
              </FormField>
              <FormField label="Departemen" hint="kalau scope departemen">
                <select name="departmentId" className={inputClass}>
                  <option value="">-- tidak ada --</option>
                  {deptList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Role" hint="kalau scope role">
                <select name="role" className={inputClass}>
                  <option value="">-- tidak ada --</option>
                  <option value="company_admin">Admin Perusahaan</option>
                  <option value="department_head">Kepala Departemen</option>
                  <option value="staff">Staff</option>
                </select>
              </FormField>
            </FormSection>
            <DrawerFooter submitLabel="Tambah Rule" />
          </form>
        </FormDrawer>
      </div>

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={rules} rowKey={(rule) => rule.id} emptyMessage="Belum ada rule — semua staf bisa lihat semua dokumen." />
    </div>
  );
}
