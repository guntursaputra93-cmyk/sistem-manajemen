import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employees, departments } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { createEmployee } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";

const STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  cuti_panjang: "Cuti Panjang",
  resign: "Resign",
  diberhentikan: "Diberhentikan",
};

const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  aktif: "sage",
  cuti_panjang: "powder-blue",
  resign: "dusty-rose",
  diberhentikan: "destructive",
};

export default async function KaryawanPage({
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

  if (!hasPermission(session.user.role, "VIEW_EMPLOYEES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_data_karyawan", companySlug }));

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));

  const [empList, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(employees)
        .where(
          visibleEmployeeIds
            ? and(eq(employees.companyId, company.id), inArray(employees.id, visibleEmployeeIds))
            : eq(employees.companyId, company.id)
        )
        .orderBy(asc(employees.fullName))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
  ]);

  const canManage = hasPermission(session.user.role, "MANAGE_EMPLOYEES");

  const columns: DataTableColumn<(typeof empList)[number]>[] = [
    {
      key: "fullName",
      header: "Nama",
      render: (emp) => (
        <Link href={`/${companySlug}/sdm/karyawan/${emp.id}`} className="font-medium text-sage-deep hover:underline">
          {emp.fullName}
        </Link>
      ),
    },
    { key: "positionTitle", header: "Jabatan", render: (emp) => emp.currentPositionTitle ?? "-" },
    { key: "department", header: "Departemen", render: (emp) => deptList.find((d) => d.id === emp.departmentId)?.name ?? "-" },
    { key: "joinDate", header: "Tanggal Bergabung", render: (emp) => emp.joinDate },
    {
      key: "status",
      header: "Status",
      render: (emp) => <Badge variant={STATUS_VARIANT[emp.employmentStatus] ?? "powder-blue"}>{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</Badge>,
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Data Karyawan</h1>
        <p className="text-sm text-ink-muted mt-1">
          {session.user.role === "staff"
            ? "Data karyawan milikmu."
            : session.user.role === "department_head"
              ? "Karyawan di departemenmu."
              : `Semua karyawan ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Tambah Karyawan">
          <form action={createEmployee} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">NIK</label>
              <input name="nik" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Lengkap</label>
              <input name="fullName" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Email (opsional)</label>
              <input name="email" type="email" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Bergabung</label>
              <DatePicker name="joinDate" required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Lahir (opsional)</label>
              <DatePicker name="birthDate" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jabatan Awal</label>
              <input name="positionTitle" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Departemen</label>
              <select name="departmentId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface">
                <option value="">-- tidak ada --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenjang (opsional)</label>
              <input name="jobLevel" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Telepon</label>
              <input name="phone" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Alamat</label>
              <input name="address" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontak Darurat — Nama</label>
              <input name="emergencyContactName" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontak Darurat — Telepon</label>
              <input name="emergencyContactPhone" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Tambah Karyawan
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={empList} rowKey={(emp) => emp.id} emptyMessage="Belum ada data karyawan. Karyawan yang ditambahkan akan muncul di sini." />
    </div>
  );
}
