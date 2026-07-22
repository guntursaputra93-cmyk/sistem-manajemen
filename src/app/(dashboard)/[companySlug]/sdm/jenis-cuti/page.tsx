import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, leaveTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createLeaveType, updateLeaveType } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

export default async function JenisCutiPage({
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

  if (!hasPermission(session.user.role, "MANAGE_LEAVE_TYPES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_cuti_absensi", companySlug }));

  const leaveTypeList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(leaveTypes).where(eq(leaveTypes.companyId, company.id)).orderBy(asc(leaveTypes.name))
  );

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Jenis Cuti" }]}
        title="Jenis Cuti"
        description={`Konfigurasi jenis cuti & kuota tahunan default untuk ${company.name}.`}
        actions={
          <FormDrawer buttonLabel="Tambah Jenis Cuti" title="Tambah Jenis Cuti" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={createLeaveType}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <FormSection title="Detail Jenis Cuti">
                <FormField label="Kode *">
                  <input autoComplete="off" name="code" required placeholder="mis. TAHUNAN" className={`${inputClass} uppercase`} />
                </FormField>
                <FormField label="Nama *">
                  <input autoComplete="new-password" name="name" required className={inputClass} />
                </FormField>
                <FormField label="Kuota/Tahun *">
                  <input autoComplete="off" name="defaultQuotaPerYear" type="number" min={0} required className={inputClass} />
                </FormField>
                <FormField label="Dibayar">
                  <label className="flex items-center gap-2 py-2 text-[13px] text-ink">
                    <input type="checkbox" name="isPaid" value="true" defaultChecked className="h-4 w-4 accent-sage-deep" />
                    Cuti dibayar
                  </label>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Jenis Cuti" />
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
        {leaveTypeList.length === 0 && <EmptyState message="Belum ada jenis cuti. Jenis cuti yang ditambahkan akan muncul di sini." />}
        {leaveTypeList.map((lt) => (
          <div key={lt.id} className="max-w-2xl bg-surface rounded-xl border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] p-4">
            <form action={updateLeaveType} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="leaveTypeId" value={lt.id} />
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Kode</label>
                <p className="text-[13px] font-semibold text-ink py-2">{lt.code}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
                <input autoComplete="new-password" name="name" defaultValue={lt.name} required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Kuota/Tahun</label>
                <input autoComplete="off" name="defaultQuotaPerYear" type="number" min={0} defaultValue={lt.defaultQuotaPerYear} required className={inputClass} />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  <input type="checkbox" name="isPaid" value="true" defaultChecked={lt.isPaid} className="h-4 w-4 accent-sage-deep" />
                  Dibayar
                </label>
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
