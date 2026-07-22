import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { updateUser } from "../actions";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Pengaturan" },
          { label: "User", href: `/${companySlug}/pengaturan/user` },
          { label: targetUser.fullName },
        ]}
        title={targetUser.fullName}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card>
        <form action={updateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="userId" value={targetUser.id} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Lengkap</label>
            <input autoComplete="new-password"
              name="fullName"
              defaultValue={targetUser.fullName}
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Email</label>
            <input autoComplete="new-password"
              name="email"
              type="email"
              defaultValue={targetUser.email}
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Role</label>
            <select
              name="role"
              defaultValue={targetUser.role}
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="staff">Staff</option>
              <option value="department_head">Kepala Departemen</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Status</label>
            <select
              name="isActive"
              defaultValue={String(targetUser.isActive)}
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </div>
          <div className="col-span-full">
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Departemen (wajib utk Staff/Kepala Departemen)</label>
            <select
              name="departmentId"
              defaultValue={targetUser.departmentId ?? ""}
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-full">
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ganti Password (opsional)</label>
            <input autoComplete="new-password"
              name="newPassword"
              type="password"
              minLength={8}
              placeholder="Kosongkan kalau tidak ganti"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div className="col-span-full">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Edit
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
