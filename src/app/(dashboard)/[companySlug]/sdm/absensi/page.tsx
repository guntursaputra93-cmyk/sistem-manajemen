import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, attendanceRecords, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { recordAttendance } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
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

  const canManage = hasPermission(session.user.role, "MANAGE_ATTENDANCE");

  const columns: DataTableColumn<(typeof recordRows)[number]>[] = [
    { key: "employee", header: "Karyawan", render: (r) => empList.find((e) => e.id === r.employeeId)?.fullName ?? "-" },
    { key: "date", header: "Tanggal", render: (r) => r.attendanceDate },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "notes", header: "Catatan", render: (r) => r.notes ?? "-" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Absensi</h1>
        <p className="text-sm text-ink-muted mt-1">
          {session.user.role === "staff"
            ? "Absensi milikmu."
            : session.user.role === "department_head"
              ? "Absensi di departemenmu."
              : `Absensi ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Catat Absensi">
          <form action={recordAttendance} className="grid grid-cols-4 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Karyawan</label>
              <select name="employeeId" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                <option value="">-- pilih --</option>
                {empList.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal</label>
              <DatePicker name="attendanceDate" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
              <select name="status" required defaultValue="hadir" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Simpan
              </button>
            </div>
            <div className="col-span-4">
              <label className="block text-xs font-medium text-ink-muted mb-1">Catatan (opsional)</label>
              <input name="notes" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={recordRows} rowKey={(r) => r.id} emptyMessage="Belum ada catatan absensi." />
    </div>
  );
}
