import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOrganization } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function OrganisasiPage({
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

  if (!hasPermission(session.user.role, "VIEW_ORGANIZATIONS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const orgList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(desc(organizations.createdAt))
  );

  const canManage = hasPermission(session.user.role, "MANAGE_ORGANIZATIONS");

  const columns: DataTableColumn<(typeof orgList)[number]>[] = [
    {
      key: "name",
      header: "Nama",
      render: (org) => (
        <a href={`/${companySlug}/crm/organisasi/${org.id}`} className="font-medium text-sage-deep hover:underline">
          {org.name}
        </a>
      ),
    },
    { key: "industry", header: "Industri", render: (org) => org.industry ?? "-" },
    { key: "source", header: "Asal Akuisisi", render: (org) => org.source ?? "-" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Organisasi / Klien (CRM)</h1>
        <p className="text-sm text-ink-muted mt-1">Daftar organisasi/klien untuk {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Tambah Organisasi">
          <form action={createOrganization} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Organisasi</label>
              <input autoComplete="new-password"
                name="name"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Industri</label>
              <input autoComplete="off"
                name="industry"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ukuran Perusahaan</label>
              <input autoComplete="off"
                name="companySize"
                placeholder="mis. 50-100 karyawan"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Asal Akuisisi</label>
              <input autoComplete="off"
                name="source"
                placeholder="mis. referral, website"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan</label>
              <textarea autoComplete="off"
                name="notes"
                rows={2}
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
      )}

      <DataTable columns={columns} rows={orgList} rowKey={(org) => org.id} emptyMessage="Belum ada organisasi. Organisasi/klien yang ditambahkan akan muncul di sini." />
    </div>
  );
}
