import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, salaryComponents } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createSalaryComponent, updateSalaryComponent } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const TYPE_LABEL: Record<string, string> = { pendapatan: "Pendapatan", potongan: "Potongan" };

export default async function KomponenGajiPage({
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

  if (!hasPermission(session.user.role, "MANAGE_SALARY_COMPONENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const componentList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(salaryComponents).where(eq(salaryComponents.companyId, company.id)).orderBy(asc(salaryComponents.name))
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Komponen Gaji</h1>
        <p className="text-sm text-ink-muted mt-1">Konfigurasi komponen pendapatan/potongan untuk {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Komponen Gaji">
        <form action={createSalaryComponent} className="grid grid-cols-3 gap-4 items-end">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Kode</label>
            <input name="code" required placeholder="mis. GAJI-POKOK" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Nama</label>
            <input name="name" required placeholder="mis. Gaji Pokok" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Tipe</label>
            <select name="componentType" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
              <option value="pendapatan">Pendapatan</option>
              <option value="potongan">Potongan</option>
            </select>
          </div>
          <div className="col-span-3">
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <section className="space-y-3">
        {componentList.length === 0 && <EmptyState message="Belum ada komponen gaji. Komponen yang ditambahkan akan muncul di sini." />}
        {componentList.map((sc) => (
          <div key={sc.id} className="bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4">
            <form action={updateSalaryComponent} className="grid grid-cols-3 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="salaryComponentId" value={sc.id} />
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Kode</label>
                <p className="text-sm text-ink py-2">{sc.code}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Nama</label>
                <input name="name" defaultValue={sc.name} required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-ink-muted mb-1">Tipe</label>
                  <select name="componentType" defaultValue={sc.componentType} className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                    <option value="pendapatan">Pendapatan</option>
                    <option value="potongan">Potongan</option>
                  </select>
                </div>
                <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                  Simpan
                </button>
              </div>
              <div>
                <Badge variant={sc.componentType === "pendapatan" ? "sage" : "dusty-rose"}>{TYPE_LABEL[sc.componentType]}</Badge>
              </div>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
