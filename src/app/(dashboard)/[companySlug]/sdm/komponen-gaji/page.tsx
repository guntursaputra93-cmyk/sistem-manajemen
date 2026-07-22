import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, salaryComponents, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createSalaryComponent, updateSalaryComponent } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
  // Akun KEWAJIBAN posting untuk tujuan potongan (mis. Utang BPJS, Utang PPh 21).
  const liabilityAccounts = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ id: chartOfAccounts.id, code: chartOfAccounts.code, name: chartOfAccounts.name })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.accountType, "kewajiban"), eq(chartOfAccounts.isHeader, false), eq(chartOfAccounts.isActive, true)))
      .orderBy(asc(chartOfAccounts.code))
  );

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Komponen Gaji" }]}
        title="Komponen Gaji"
        description={`Konfigurasi komponen pendapatan/potongan untuk ${company.name}.`}
        actions={
          <FormDrawer buttonLabel="Tambah Komponen" title="Tambah Komponen Gaji" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={createSalaryComponent}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <FormSection title="Detail Komponen">
                <FormField label="Kode *">
                  <input autoComplete="off" name="code" required placeholder="mis. GAJI-POKOK" className={`${inputClass} uppercase`} />
                </FormField>
                <FormField label="Nama *">
                  <input autoComplete="new-password" name="name" required placeholder="mis. Gaji Pokok" className={inputClass} />
                </FormField>
                <FormField label="Tipe *">
                  <select name="componentType" required className={inputClass}>
                    <option value="pendapatan">Pendapatan</option>
                    <option value="potongan">Potongan</option>
                  </select>
                </FormField>
                <FormField label="Akun Kewajiban" full optional hint="Untuk POTONGAN saja (mis. Utang BPJS/PPh). Kosongkan → ikut ke Utang Gaji. Diabaikan untuk pendapatan.">
                  <select name="liabilityAccountId" className={inputClass}>
                    <option value="">— tidak ada (ikut Utang Gaji) —</option>
                    {liabilityAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Komponen" />
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
        {componentList.length === 0 && <EmptyState message="Belum ada komponen gaji. Komponen yang ditambahkan akan muncul di sini." />}
        {componentList.map((sc) => (
          <div key={sc.id} className="max-w-3xl bg-surface rounded-xl border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] p-4">
            <form action={updateSalaryComponent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="salaryComponentId" value={sc.id} />
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Kode</label>
                <div className="flex items-center gap-2 py-1">
                  <p className="text-[13px] font-semibold text-ink">{sc.code}</p>
                  <Badge variant={sc.componentType === "pendapatan" ? "sage" : "dusty-rose"}>{TYPE_LABEL[sc.componentType]}</Badge>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
                <input autoComplete="new-password" name="name" defaultValue={sc.name} required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Tipe</label>
                <select name="componentType" defaultValue={sc.componentType} className={inputClass}>
                  <option value="pendapatan">Pendapatan</option>
                  <option value="potongan">Potongan</option>
                </select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-ink-muted mb-1" title="Untuk potongan: akun kewajiban tujuan (kosong = Utang Gaji)">Akun Kewajiban</label>
                  <select name="liabilityAccountId" defaultValue={sc.liabilityAccountId ?? ""} className={inputClass}>
                    <option value="">— Utang Gaji —</option>
                    {liabilityAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </select>
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
