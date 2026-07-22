import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentCategories } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { addDocumentCategory, deleteDocumentCategory } from "./actions";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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

  const columns: DataTableColumn<(typeof categories)[number]>[] = [
    { key: "code", header: "Kode", render: (c) => c.code },
    { key: "name", header: "Nama", render: (c) => c.name },
    { key: "level", header: "Level", render: (c) => c.hierarchyLevel },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (c) => (
        <form action={deleteDocumentCategory}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="id" value={c.id} />
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
        breadcrumb={[{ label: "Pengaturan" }, { label: "Kategori Dokumen" }]}
        title="Kategori Dokumen"
        description="Kode kategori baku (mis. PP, SK, KTR). Kode ini juga jadi acuan jenjang approval dokumen di halaman Jenjang Approval."
        actions={
          <FormDrawer buttonLabel="Tambah Kategori" title="Tambah Kategori Dokumen" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={addDocumentCategory}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <FormSection title="Detail Kategori">
                <FormField label="Kode *">
                  <input autoComplete="off" name="code" required maxLength={10} className={`${inputClass} uppercase`} />
                </FormField>
                <FormField label="Nama *">
                  <input autoComplete="new-password" name="name" required className={inputClass} />
                </FormField>
                <FormField label="Hierarchy Level *" full>
                  <input autoComplete="off" name="hierarchyLevel" type="number" min={1} defaultValue={1} required className={inputClass} />
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Kategori" />
            </form>
          </FormDrawer>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={categories} rowKey={(c) => c.id} emptyMessage="Belum ada kategori. Kategori yang ditambahkan akan muncul di sini." />
    </div>
  );
}
