import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, competencyTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createCompetencyType, updateCompetencyType } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Jenis Kompetensi</h1>
        <p className="text-sm text-ink-muted mt-1">Konfigurasi jenis sertifikasi/kompetensi untuk {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Jenis Kompetensi">
        <form action={createCompetencyType} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
            <input autoComplete="off" name="code" required placeholder="mis. AK3-UMUM" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base uppercase" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
            <input autoComplete="new-password" name="name" required placeholder="mis. AK3 Umum" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kategori (opsional)</label>
            <input autoComplete="off" name="category" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          </div>
          <div className="col-span-full">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <section className="space-y-2">
        {typeList.length === 0 && <EmptyState message="Belum ada jenis kompetensi. Jenis kompetensi yang ditambahkan akan muncul di sini." />}
        {typeList.map((ct) => (
          <div key={ct.id} className="max-w-2xl bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-3">
            <form action={updateCompetencyType} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="competencyTypeId" value={ct.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
                <p className="text-[11px] text-ink py-[6px]">{ct.code}</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
                <input autoComplete="new-password" name="name" defaultValue={ct.name} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kategori</label>
                  <input autoComplete="off" name="category" defaultValue={ct.category ?? ""} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
                </div>
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                  Edit
                </button>
              </div>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
