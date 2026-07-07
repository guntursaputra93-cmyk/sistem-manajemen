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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">Pilih Perusahaan</h1>
          <p className="text-sm text-gray-500 mt-1">Anda login sebagai Super Admin</p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Tambah Perusahaan</h2>
          <form action={createCompany} className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
              <input name="name" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kode (opsional)</label>
              <input name="code" maxLength={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Bisnis</label>
              <input name="businessType" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-3">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Tambah Perusahaan
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {allCompanies.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">Belum ada perusahaan terdaftar.</p>
          ) : (
            allCompanies.map((company) => (
              <div key={company.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Link href={`/${company.slug}/dashboard`} className="font-medium text-gray-900 hover:text-blue-600">
                    {company.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <Link href={`/${company.slug}/pengaturan/modul`} className="text-xs text-blue-600 hover:underline">
                      Modul
                    </Link>
                    <span className={company.isActive ? "text-xs text-green-600" : "text-xs text-gray-400"}>
                      {company.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
                <form action={updateCompany} className="grid grid-cols-4 gap-3 items-end">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nama</label>
                    <input name="name" defaultValue={company.name} required className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Kode</label>
                    <input name="code" defaultValue={company.code ?? ""} maxLength={10} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm uppercase" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Jenis Bisnis</label>
                    <input name="businessType" defaultValue={company.businessType} required className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <select name="isActive" defaultValue={String(company.isActive)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
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
