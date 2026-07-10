import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { createUser } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function UserListPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; prefillFullName?: string; prefillEmail?: string; linkEmployeeId?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, prefillFullName, prefillEmail, linkEmployeeId } = await searchParams;
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

  const [userList, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
  ]);

  const columns: DataTableColumn<(typeof userList)[number]>[] = [
    {
      key: "name",
      header: "Nama",
      render: (u) => (
        <a href={`/${companySlug}/pengaturan/user/${u.id}`} className="font-medium text-sage-deep hover:underline">
          {u.fullName}
        </a>
      ),
    },
    { key: "email", header: "Email", render: (u) => u.email },
    { key: "role", header: "Role", render: (u) => ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role },
    { key: "dept", header: "Departemen", render: (u) => deptList.find((d) => d.id === u.departmentId)?.name ?? "-" },
    {
      key: "status",
      header: "Status",
      render: (u) => <Badge variant={u.isActive ? "sage" : "dusty-rose"}>{u.isActive ? "Aktif" : "Nonaktif"}</Badge>,
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">User</h1>
        <p className="text-sm text-ink-muted mt-1">Kelola akun user di {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card
        title="Tambah User"
        description={linkEmployeeId ? "Membuat akses sistem untuk karyawan yang dipilih dari halaman Data Karyawan." : undefined}
      >
        <form action={createUser} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          {linkEmployeeId && <input type="hidden" name="linkEmployeeId" value={linkEmployeeId} />}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Nama Lengkap</label>
            <input
              name="fullName"
              defaultValue={prefillFullName ?? ""}
              required
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={prefillEmail ?? ""}
              required
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Role</label>
            <select
              name="role"
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            >
              <option value="staff">Staff</option>
              <option value="department_head">Kepala Departemen</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-muted mb-1">Departemen (wajib utk Staff/Kepala Departemen)</label>
            <select
              name="departmentId"
              className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
            >
              <option value="">-- tidak ada --</option>
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Tambah User
            </button>
          </div>
        </form>
      </Card>

      <DataTable columns={columns} rows={userList} rowKey={(u) => u.id} emptyMessage="Belum ada user. User yang ditambahkan akan muncul di sini." />
    </div>
  );
}
