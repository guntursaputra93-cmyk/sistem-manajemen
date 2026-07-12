import Link from "next/link";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import { createCompany, updateCompany } from "./actions";

export default async function PilihPerusahaanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null; // proxy.ts sudah menjamin ini tidak kejadian di praktiknya

  const allCompanies = await withTenantContext(
    { role: session.user.role, companyId: null },
    (tx) => tx.select().from(companies).orderBy(asc(companies.name))
  );

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink">Pilih Perusahaan</h1>
          <p className="text-sm text-ink-muted mt-1">Anda login sebagai Super Admin</p>
        </div>

        {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
        {success && (
          <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
        )}

        <div className="bg-surface rounded-xl border border-ink-muted/10 shadow-sm p-6">
          <h2 className="font-semibold text-ink mb-4">Tambah Perusahaan</h2>
          <form action={createCompany} className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
              <input name="name" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode (opsional)</label>
              <input name="code" maxLength={10} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface uppercase" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis Bisnis</label>
              <input name="businessType" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div className="col-span-3">
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Tambah Perusahaan
              </button>
            </div>
          </form>
        </div>

        <div className="bg-surface rounded-xl border border-ink-muted/10 shadow-sm divide-y divide-ink-muted/10">
          {allCompanies.length === 0 ? (
            <p className="p-6 text-sm text-ink-muted text-center">Belum ada perusahaan terdaftar.</p>
          ) : (
            allCompanies.map((company) => (
              <div key={company.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL Storage dinamis per company, bukan aset statis.
                      <img src={company.logoUrl} alt={`Logo ${company.name}`} className="h-6 w-6 rounded-md object-contain bg-white border border-ink-muted/10" />
                    ) : null}
                    <Link href={`/${company.slug}/dashboard`} className="font-medium text-ink hover:text-sage-deep">
                      {company.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/${company.slug}/pengaturan/modul`} className="text-xs text-sage-deep hover:underline">
                      Modul
                    </Link>
                    <span className={company.isActive ? "text-xs text-sage-deep" : "text-xs text-ink-muted"}>
                      {company.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
                <form action={updateCompany} className="grid grid-cols-4 gap-3 items-end">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div>
                    <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
                    <input name="name" defaultValue={company.name} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
                    <input name="code" defaultValue={company.code ?? ""} maxLength={10} className="w-full border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis Bisnis</label>
                    <input name="businessType" defaultValue={company.businessType} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface" />
                  </div>
                  <div className="flex gap-2">
                    <select name="isActive" defaultValue={String(company.isActive)} className="border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface">
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                    <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      Simpan
                    </button>
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] font-semibold text-ink-muted mb-1">Logo (opsional, PNG/JPG, maks 2MB)</label>
                    <input name="logoFile" type="file" accept="image/png,image/jpeg" className="text-sm text-ink" />
                  </div>
                </form>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
