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
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { StatCard } from "@/components/ui/StatCard";
import { Users, UserCheck, Plane, UserMinus } from "lucide-react";

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
  searchParams: Promise<{ error?: string; success?: string; q?: string; dept?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, dept, status } = await searchParams;
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

  // Penyaringan server-side dari ?q= / ?dept= / ?status= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const filtered = empList.filter((emp) => {
    if (needle) {
      const haystack = `${emp.fullName} ${emp.nik ?? ""} ${emp.currentPositionTitle ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (dept && emp.departmentId !== dept) return false;
    if (status && emp.employmentStatus !== status) return false;
    return true;
  });

  const canManage = hasPermission(session.user.role, "MANAGE_EMPLOYEES");

  // Ringkasan status utk kartu statistik — dihitung dari daftar penuh (bukan
  // hasil filter) supaya angkanya stabil saat user mencari/memfilter.
  const statCounts = {
    total: empList.length,
    aktif: empList.filter((e) => e.employmentStatus === "aktif").length,
    cuti: empList.filter((e) => e.employmentStatus === "cuti_panjang").length,
    keluar: empList.filter((e) => e.employmentStatus === "resign" || e.employmentStatus === "diberhentikan").length,
  };

  const columns: DataTableColumn<(typeof empList)[number]>[] = [
    {
      key: "fullName",
      header: "Nama",
      render: (emp) => (
        <Link href={`/${companySlug}/sdm/karyawan/${emp.id}`} className="font-semibold text-sage-deep hover:underline">
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
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Data Karyawan" }]}
        title="Data Karyawan"
        description={
          session.user.role === "staff"
            ? "Data karyawan milikmu."
            : session.user.role === "department_head"
              ? "Karyawan di departemenmu."
              : `Semua karyawan ${company.name}.`
        }
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Tambah Karyawan"
              title="Tambah Karyawan"
              description="Field bertanda * wajib diisi."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createEmployee}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="① Identitas">
                  <FormField label="NIK *">
                    <input name="nik" required autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Nama Lengkap *">
                    <input name="fullName" required autoComplete="new-password" className={inputClass} />
                  </FormField>
                  <FormField label="Email" optional>
                    <input name="email" type="email" autoComplete="new-password" className={inputClass} />
                  </FormField>
                  <FormField label="NPWP" optional>
                    <input name="npwp" autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Tanggal Lahir" optional>
                    <DatePicker name="birthDate" />
                  </FormField>
                </FormSection>
                <FormSection title="② Pekerjaan">
                  <FormField label="Tanggal Bergabung *">
                    <DatePicker name="joinDate" required />
                  </FormField>
                  <FormField label="Jabatan Awal *">
                    <input name="positionTitle" required autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Departemen">
                    <select name="departmentId" className={inputClass}>
                      <option value="">-- tidak ada --</option>
                      {deptList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Jenjang" optional>
                    <input name="jobLevel" autoComplete="off" className={inputClass} />
                  </FormField>
                </FormSection>
                <FormSection title="③ Kontak">
                  <FormField label="Telepon">
                    <input name="phone" autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Alamat" full>
                    <input name="address" autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Kontak Darurat — Nama">
                    <input name="emergencyContactName" autoComplete="off" className={inputClass} />
                  </FormField>
                  <FormField label="Kontak Darurat — Telepon">
                    <input name="emergencyContactPhone" autoComplete="off" className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Karyawan" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && (
        <div className="mb-4 rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">
          Berhasil disimpan.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Karyawan" value={statCounts.total} icon={<Users size={15} aria-hidden="true" />} />
        <StatCard label="Aktif" value={statCounts.aktif} icon={<UserCheck size={15} aria-hidden="true" />} iconBgClass="bg-success/15" />
        <StatCard label="Cuti Panjang" value={statCounts.cuti} icon={<Plane size={15} aria-hidden="true" />} iconBgClass="bg-butter/40" />
        <StatCard label="Resign/Berhenti" value={statCounts.keluar} icon={<UserMinus size={15} aria-hidden="true" />} iconBgClass="bg-destructive/10" />
      </div>

      <ListToolbar
        searchPlaceholder="Cari nama, NIK, atau jabatan…"
        filters={[
          {
            name: "dept",
            allLabel: "Semua Departemen",
            options: deptList.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            name: "status",
            allLabel: "Semua Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        countLabel={`${filtered.length} karyawan`}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(emp) => emp.id}
        emptyMessage={
          needle || dept || status
            ? "Tidak ada karyawan yang cocok dengan pencarian/filter."
            : "Belum ada data karyawan. Karyawan yang ditambahkan akan muncul di sini."
        }
      />
    </div>
  );
}
