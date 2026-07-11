import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentCategories } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { addDocumentCategory, deleteDocumentCategory } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

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
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Kategori Dokumen</h1>
        <p className="text-sm text-ink-muted mt-1">
          Kode kategori baku (mis. PP, SK, KTR). Kode ini juga jadi acuan jenjang approval dokumen di halaman Jenjang Approval.
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Kategori">
        <form action={addDocumentCategory} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
            <input autoComplete="off"
              name="code"
              required
              maxLength={10}
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm uppercase text-ink bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
            <input autoComplete="new-password"
              name="name"
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Hierarchy Level</label>
            <input autoComplete="off"
              name="hierarchyLevel"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div className="col-span-full">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <DataTable columns={columns} rows={categories} rowKey={(c) => c.id} emptyMessage="Belum ada kategori. Kategori yang ditambahkan akan muncul di sini." />
    </div>
  );
}
