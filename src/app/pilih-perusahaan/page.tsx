import Link from "next/link";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import { createCompany, updateCompany } from "./actions";
import { inputClass } from "@/components/ui/FormField";

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
          <h1 className="font-display text-xl font-extrabold text-ink">Pilih Perusahaan</h1>
          <p className="text-[13px] text-ink-muted mt-1">Anda login sebagai Super Admin</p>
        </div>

        {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-[13px] rounded-lg px-4 py-3">{error}</div>}
        {success && (
          <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>
        )}

        <div className="bg-surface rounded-xl border border-ink-muted/10 shadow-sm p-6">
          <h2 className="font-display font-bold text-ink mb-4">Tambah Perusahaan</h2>
          <form action={createCompany} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
                <input name="name" required className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Kode (opsional)</label>
                <input name="code" maxLength={10} className={`${inputClass} uppercase`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Jenis Bisnis</label>
                <input name="businessType" required className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer shadow-[0_3px_12px_rgba(185,92,46,0.32)]"
              >
                Tambah Perusahaan
              </button>
            </div>
          </form>
        </div>

        <div className="bg-surface rounded-xl border border-ink-muted/10 shadow-sm divide-y divide-ink-muted/10">
          {allCompanies.length === 0 ? (
            <p className="p-6 text-[13px] text-ink-muted text-center">Belum ada perusahaan terdaftar.</p>
          ) : (
            allCompanies.map((company) => (
              <div key={company.id} className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL Storage dinamis per company, bukan aset statis.
                      <img src={company.logoUrl} alt={`Logo ${company.name}`} className="h-7 w-7 rounded-md object-contain bg-white border border-ink-muted/10" />
                    ) : null}
                    <Link href={`/${company.slug}/dashboard`} className="font-semibold text-[15px] text-ink hover:text-sage-deep">
                      {company.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/${company.slug}/pengaturan/modul`} className="text-xs font-semibold text-sage-deep hover:underline">
                      Modul
                    </Link>
                    <span className={company.isActive ? "text-xs text-sage-deep" : "text-xs text-ink-muted"}>
                      {company.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
                <form action={updateCompany} className="space-y-3">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink-muted mb-1">Nama</label>
                      <input name="name" defaultValue={company.name} required className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-muted mb-1">Kode</label>
                      <input name="code" defaultValue={company.code ?? ""} maxLength={10} className={`${inputClass} uppercase`} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink-muted mb-1">Jenis Bisnis</label>
                      <input name="businessType" defaultValue={company.businessType} required className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-muted mb-1">Logo (opsional, PNG/JPG, maks 2MB)</label>
                    <input name="logoFile" type="file" accept="image/png,image/jpeg" className="text-[13px] text-ink" />
                  </div>
                  {/* Tombol Simpan dipisah ke baris sendiri rata kanan dengan padding —
                      sebelumnya terjepit di kolom grid paling kanan, mepet tepi kartu. */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <select name="isActive" defaultValue={String(company.isActive)} className={`${inputClass} w-auto`}>
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                    <button
                      type="submit"
                      className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
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
