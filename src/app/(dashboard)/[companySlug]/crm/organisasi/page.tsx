import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOrganization } from "./actions";

export default async function OrganisasiPage({
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

  if (!hasPermission(session.user.role, "VIEW_ORGANIZATIONS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const orgList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(desc(organizations.createdAt))
  );

  const canManage = hasPermission(session.user.role, "MANAGE_ORGANIZATIONS");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Organisasi / Klien (CRM)</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar organisasi/klien untuk {company.name}.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Tambah Organisasi</h2>
          <form action={createOrganization} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Organisasi</label>
              <input name="name" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Industri</label>
              <input name="industry" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ukuran Perusahaan</label>
              <input name="companySize" placeholder="mis. 50-100 karyawan" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Asal Akuisisi</label>
              <input name="source" placeholder="mis. referral, website" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
              <textarea name="notes" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Tambah
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nama</th>
              <th className="text-left px-4 py-2">Industri</th>
              <th className="text-left px-4 py-2">Asal Akuisisi</th>
            </tr>
          </thead>
          <tbody>
            {orgList.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada organisasi.
                </td>
              </tr>
            )}
            {orgList.map((org) => (
              <tr key={org.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/${companySlug}/crm/organisasi/${org.id}`} className="text-blue-600 hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{org.industry ?? "-"}</td>
                <td className="px-4 py-2">{org.source ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
