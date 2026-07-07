import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { createDepartment, updateDepartment, deleteDepartment } from "./actions";

export default async function DepartemenPage({
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

  if (!hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const deptList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
  );

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Departemen</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola departemen di {company.name}.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Tambah Departemen</h2>
        <form action={createDepartment} className="grid grid-cols-3 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
            <input name="name" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kode (opsional)</label>
            <input name="code" maxLength={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Induk Departemen (opsional)</label>
            <select name="parentDepartmentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Tambah
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {deptList.length === 0 && (
          <p className="text-sm text-gray-400 italic">Belum ada departemen.</p>
        )}
        {deptList.map((dept) => (
          <div key={dept.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <form action={updateDepartment} className="grid grid-cols-4 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="departmentId" value={dept.id} />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
                <input name="name" defaultValue={dept.name} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kode</label>
                <input name="code" defaultValue={dept.code ?? ""} maxLength={10} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Induk</label>
                <select name="parentDepartmentId" defaultValue={dept.parentDepartmentId ?? ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- tidak ada --</option>
                  {deptList.filter((d) => d.id !== dept.id).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-lg transition">
                  Simpan
                </button>
              </div>
            </form>
            <form action={deleteDepartment} className="mt-2">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="departmentId" value={dept.id} />
              <button type="submit" className="text-red-500 hover:underline text-xs">
                Hapus Departemen
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
