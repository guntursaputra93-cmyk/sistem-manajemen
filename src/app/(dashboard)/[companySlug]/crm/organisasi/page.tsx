import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOrganization } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
    {
      key: "partnerType",
      header: "Tipe",
      render: (org) => (
        <Badge variant={org.partnerType === "pemasok" ? "dusty-rose" : org.partnerType === "keduanya" ? "powder-blue" : "sage"}>
          {org.partnerType === "pemasok" ? "Pemasok" : org.partnerType === "keduanya" ? "Keduanya" : "Klien"}
        </Badge>
      ),
    },
    { key: "industry", header: "Industri", render: (org) => org.industry ?? "-" },
    { key: "source", header: "Asal Akuisisi", render: (org) => org.source ?? "-" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "CRM" }, { label: "Organisasi / Klien" }]}
        title="Organisasi / Klien"
        description={`Daftar organisasi/klien untuk ${company.name}.`}
        actions={
          canManage && (
            <FormDrawer buttonLabel="Tambah Organisasi" title="Tambah Organisasi" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createOrganization}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Profil Organisasi">
                  <FormField label="Nama Organisasi *" full>
                    <input autoComplete="new-password" name="name" required className={inputClass} />
                  </FormField>
                  <FormField label="Tipe Rekanan *" full hint="Pemasok/vendor dipakai untuk uang muka & hutang di modul Keuangan.">
                    <select name="partnerType" defaultValue="klien" className={inputClass}>
                      <option value="klien">Klien (pelanggan)</option>
                      <option value="pemasok">Pemasok / Vendor</option>
                      <option value="keduanya">Keduanya</option>
                    </select>
                  </FormField>
                  <FormField label="Industri">
                    <input autoComplete="off" name="industry" className={inputClass} />
                  </FormField>
                  <FormField label="Ukuran Perusahaan">
                    <input autoComplete="off" name="companySize" placeholder="mis. 50-100 karyawan" className={inputClass} />
                  </FormField>
                  <FormField label="Asal Akuisisi" full>
                    <input autoComplete="off" name="source" placeholder="mis. referral, website" className={inputClass} />
                  </FormField>
                  <FormField label="Catatan" optional full>
                    <textarea autoComplete="off" name="notes" rows={3} className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Tambah Organisasi" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={orgList} rowKey={(org) => org.id} emptyMessage="Belum ada organisasi. Organisasi/klien yang ditambahkan akan muncul di sini." />
    </div>
  );
}
