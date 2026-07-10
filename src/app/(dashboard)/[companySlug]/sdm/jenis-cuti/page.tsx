import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, leaveTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createLeaveType, updateLeaveType } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Jenis Cuti</h1>
        <p className="text-sm text-ink-muted mt-1">Konfigurasi jenis cuti & kuota tahunan default untuk {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Jenis Cuti">
        <form action={createLeaveType} className="grid grid-cols-4 gap-4 items-end">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
            <input name="code" required placeholder="mis. TAHUNAN" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface uppercase" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
            <input name="name" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kuota/Tahun</label>
            <input name="defaultQuotaPerYear" type="number" min={0} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isPaid" value="true" id="isPaid" defaultChecked className="h-4 w-4 accent-sage-deep" />
            <label htmlFor="isPaid" className="text-sm text-ink-muted">Dibayar</label>
          </div>
          <div className="col-span-4">
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <section className="space-y-3">
        {leaveTypeList.length === 0 && <EmptyState message="Belum ada jenis cuti. Jenis cuti yang ditambahkan akan muncul di sini." />}
        {leaveTypeList.map((lt) => (
          <div key={lt.id} className="bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4">
            <form action={updateLeaveType} className="grid grid-cols-4 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="leaveTypeId" value={lt.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
                <p className="text-sm text-ink py-2">{lt.code}</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
                <input name="name" defaultValue={lt.name} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kuota/Tahun</label>
                <input name="defaultQuotaPerYear" type="number" min={0} defaultValue={lt.defaultQuotaPerYear} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <input type="checkbox" name="isPaid" value="true" defaultChecked={lt.isPaid} className="h-4 w-4 accent-sage-deep" />
                  Dibayar
                </label>
                <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
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
