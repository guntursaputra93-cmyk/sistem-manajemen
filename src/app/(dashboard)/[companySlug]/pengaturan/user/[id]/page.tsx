import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { updateUser } from "../actions";

export default async function UserEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_USERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [targetUser] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(users).where(and(eq(users.id, id), eq(users.companyId, company.id)))
  );
  if (!targetUser) notFound();

  const deptList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
  );

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <Link href={`/${companySlug}/pengaturan/user`} className="text-sm text-blue-600 hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{targetUser.fullName}</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <form action={updateUser} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="userId" value={targetUser.id} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input name="fullName" defaultValue={targetUser.fullName} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input name="email" type="email" defaultValue={targetUser.email} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select name="role" defaultValue={targetUser.role} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="staff">Staff</option>
              <option value="department_head">Kepala Departemen</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select name="isActive" defaultValue={String(targetUser.isActive)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Departemen (wajib utk Staff/Kepala Departemen)</label>
            <select name="departmentId" defaultValue={targetUser.departmentId ?? ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Ganti Password (opsional)</label>
            <input name="newPassword" type="password" minLength={8} placeholder="Kosongkan kalau tidak ganti" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Simpan
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
