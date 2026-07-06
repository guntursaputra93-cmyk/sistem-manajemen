import Link from "next/link";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { asc } from "drizzle-orm";

export default async function PilihPerusahaanPage() {
  const session = await auth();
  if (!session?.user) return null; // proxy.ts sudah menjamin ini tidak kejadian di praktiknya

  const allCompanies = await withTenantContext(
    { role: session.user.role, companyId: null },
    (tx) => tx.select().from(companies).orderBy(asc(companies.name))
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">Pilih Perusahaan</h1>
          <p className="text-sm text-gray-500 mt-1">Anda login sebagai Super Admin</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {allCompanies.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">Belum ada perusahaan terdaftar.</p>
          ) : (
            allCompanies.map((company) => (
              <Link
                key={company.id}
                href={`/${company.slug}/dashboard`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition"
              >
                <div>
                  <p className="font-medium text-gray-900">{company.name}</p>
                  <p className="text-xs text-gray-400">{company.businessType}</p>
                </div>
                <span className={company.isActive ? "text-xs text-green-600" : "text-xs text-gray-400"}>
                  {company.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
