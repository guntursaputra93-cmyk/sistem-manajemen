import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { createUser } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Pengaturan" }, { label: "User" }]}
        title="User"
        description={`Kelola akun user di ${company.name}.`}
        actions={
          <FormDrawer
            buttonLabel="Tambah User"
            title="Tambah User"
            description={linkEmployeeId ? "Membuat akses sistem untuk karyawan yang dipilih dari halaman Data Karyawan." : undefined}
            defaultOpen={Boolean(error) || Boolean(linkEmployeeId)}
          >
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={createUser}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              {linkEmployeeId && <input type="hidden" name="linkEmployeeId" value={linkEmployeeId} />}
              <FormSection title="① Akun">
                <FormField label="Nama Lengkap *">
                  <input autoComplete="new-password" name="fullName" defaultValue={prefillFullName ?? ""} required className={inputClass} />
                </FormField>
                <FormField label="Email *">
                  <input autoComplete="new-password" name="email" type="email" defaultValue={prefillEmail ?? ""} required className={inputClass} />
                </FormField>
                <FormField label="Password *" full hint="Minimal 8 karakter.">
                  <input autoComplete="new-password" name="password" type="password" required minLength={8} className={inputClass} />
                </FormField>
              </FormSection>
              <FormSection title="② Peran & Departemen">
                <FormField label="Role">
                  <select name="role" className={inputClass}>
                    <option value="staff">Staff</option>
                    <option value="department_head">Kepala Departemen</option>
                    <option value="company_admin">Admin Perusahaan</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </FormField>
                <FormField label="Departemen" hint="Wajib utk Staff/Kepala Departemen.">
                  <select name="departmentId" className={inputClass}>
                    <option value="">-- tidak ada --</option>
                    {deptList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah User" />
            </form>
          </FormDrawer>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={userList} rowKey={(u) => u.id} emptyMessage="Belum ada user. User yang ditambahkan akan muncul di sini." />
    </div>
  );
}
