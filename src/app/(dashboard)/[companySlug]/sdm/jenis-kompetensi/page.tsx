import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, competencyTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createCompetencyType, updateCompetencyType } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

export default async function JenisKompetensiPage({
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

  if (!hasPermission(session.user.role, "MANAGE_COMPETENCY_TYPES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug }));

  const typeList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(competencyTypes).where(eq(competencyTypes.companyId, company.id)).orderBy(asc(competencyTypes.name))
  );

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Jenis Kompetensi" }]}
        title="Jenis Kompetensi"
        description={`Konfigurasi jenis sertifikasi/kompetensi untuk ${company.name}.`}
        actions={
          <FormDrawer buttonLabel="Tambah Jenis Kompetensi" title="Tambah Jenis Kompetensi" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={createCompetencyType}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <FormSection title="Detail Jenis Kompetensi">
                <FormField label="Kode *">
                  <input autoComplete="off" name="code" required placeholder="mis. AK3-UMUM" className={`${inputClass} uppercase`} />
                </FormField>
                <FormField label="Nama *">
                  <input autoComplete="new-password" name="name" required placeholder="mis. AK3 Umum" className={inputClass} />
                </FormField>
                <FormField label="Kategori" optional full>
                  <input autoComplete="off" name="category" className={inputClass} />
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Jenis Kompetensi" />
            </form>
          </FormDrawer>
        }
      />

      {success && (
        <div className="mb-4 rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">
          Berhasil disimpan.
        </div>
      )}

      <section className="space-y-2">
        {typeList.length === 0 && <EmptyState message="Belum ada jenis kompetensi. Jenis kompetensi yang ditambahkan akan muncul di sini." />}
        {typeList.map((ct) => (
          <div key={ct.id} className="max-w-2xl bg-surface rounded-xl border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] p-4">
            <form action={updateCompetencyType} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="competencyTypeId" value={ct.id} />
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Kode</label>
                <p className="text-[13px] font-semibold text-ink py-2">{ct.code}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
                <input autoComplete="new-password" name="name" defaultValue={ct.name} required className={inputClass} />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-ink-muted mb-1">Kategori</label>
                  <input autoComplete="off" name="category" defaultValue={ct.category ?? ""} className={inputClass} />
                </div>
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer">
                  Simpan
                </button>
              </div>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
