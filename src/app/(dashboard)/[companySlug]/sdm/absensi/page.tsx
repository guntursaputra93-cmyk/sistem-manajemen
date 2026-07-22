import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, attendanceRecords, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { recordAttendance } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";

const STATUS_LABEL: Record<string, string> = {
  hadir: "Hadir",
  izin: "Izin",
  sakit: "Sakit",
  alpha: "Alpha",
  cuti: "Cuti",
};

const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  hadir: "sage",
  izin: "powder-blue",
  sakit: "dusty-rose",
  alpha: "destructive",
  cuti: "powder-blue",
};

export default async function AbsensiPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, status } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_ATTENDANCE")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_cuti_absensi", companySlug }));

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));

  const [recordRows, empList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          visibleEmployeeIds
            ? and(eq(attendanceRecords.companyId, company.id), inArray(attendanceRecords.employeeId, visibleEmployeeIds))
            : eq(attendanceRecords.companyId, company.id)
        )
        .orderBy(desc(attendanceRecords.attendanceDate))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(employees)
        .where(
          visibleEmployeeIds
            ? and(eq(employees.companyId, company.id), inArray(employees.id, visibleEmployeeIds))
            : eq(employees.companyId, company.id)
        )
    ),
  ]);

  // Penyaringan server-side dari ?q= / ?status= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const filtered = recordRows.filter((r) => {
    if (needle) {
      const empName = empList.find((e) => e.id === r.employeeId)?.fullName ?? "";
      if (!`${empName} ${r.notes ?? ""}`.toLowerCase().includes(needle)) return false;
    }
    if (status && r.status !== status) return false;
    return true;
  });

  const canManage = hasPermission(session.user.role, "MANAGE_ATTENDANCE");

  const columns: DataTableColumn<(typeof recordRows)[number]>[] = [
    { key: "employee", header: "Karyawan", render: (r) => empList.find((e) => e.id === r.employeeId)?.fullName ?? "-" },
    { key: "date", header: "Tanggal", render: (r) => r.attendanceDate },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "notes", header: "Catatan", render: (r) => r.notes ?? "-" },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Absensi" }]}
        title="Absensi"
        description={
          session.user.role === "staff"
            ? "Absensi milikmu."
            : session.user.role === "department_head"
              ? "Absensi di departemenmu."
              : `Absensi ${company.name}.`
        }
        actions={
          canManage && (
            <FormDrawer buttonLabel="Catat Absensi" title="Catat Absensi" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={recordAttendance}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Data Absensi">
                  <FormField label="Karyawan *" full>
                    <select name="employeeId" required className={inputClass}>
                      <option value="">-- pilih --</option>
                      {empList.map((e) => (
                        <option key={e.id} value={e.id}>{e.fullName}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Tanggal *">
                    <DatePicker name="attendanceDate" required />
                  </FormField>
                  <FormField label="Status *">
                    <select name="status" required defaultValue="hadir" className={inputClass}>
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Catatan" optional full>
                    <input autoComplete="off" name="notes" className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Absensi" />
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

      <ListToolbar
        searchPlaceholder="Cari nama karyawan atau catatan…"
        filters={[
          {
            name: "status",
            allLabel: "Semua Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        countLabel={`${filtered.length} catatan`}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyMessage={needle || status ? "Tidak ada catatan yang cocok dengan pencarian/filter." : "Belum ada catatan absensi."}
      />
    </div>
  );
}
