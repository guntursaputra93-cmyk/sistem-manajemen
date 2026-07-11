import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, leaveRequests, leaveTypes, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, getEmployeeByUserId, resolveViewer } from "@/lib/hr/employees";
import { createLeaveRequest, approveLeaveRequestAction, rejectLeaveRequestAction } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  pending: "powder-blue",
  approved: "sage",
  rejected: "destructive",
  cancelled: "dusty-rose",
};

export default async function CutiPage({
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

  if (!hasPermission(session.user.role, "VIEW_LEAVE_REQUESTS")) {
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

  const [requestRows, leaveTypeList, empList, ownEmployee] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(leaveRequests)
        .where(
          visibleEmployeeIds
            ? and(eq(leaveRequests.companyId, company.id), inArray(leaveRequests.employeeId, visibleEmployeeIds))
            : eq(leaveRequests.companyId, company.id)
        )
        .orderBy(asc(leaveRequests.status), asc(leaveRequests.startDate))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(leaveTypes).where(eq(leaveTypes.companyId, company.id)).orderBy(asc(leaveTypes.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(employees).where(eq(employees.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId: company.id, userId: session.user.id })),
  ]);

  const canApprove = hasPermission(session.user.role, "APPROVE_LEAVE_REQUEST");
  const canCreate = hasPermission(session.user.role, "CREATE_LEAVE_REQUEST") && ownEmployee;

  const columns: DataTableColumn<(typeof requestRows)[number]>[] = [
    { key: "employee", header: "Karyawan", render: (r) => empList.find((e) => e.id === r.employeeId)?.fullName ?? "-" },
    { key: "leaveType", header: "Jenis Cuti", render: (r) => leaveTypeList.find((lt) => lt.id === r.leaveTypeId)?.name ?? "-" },
    { key: "dates", header: "Tanggal", render: (r) => `${r.startDate} — ${r.endDate}` },
    { key: "totalDays", header: "Hari", render: (r) => r.totalDays },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: "actions",
      header: "Aksi",
      render: (r) =>
        canApprove && r.status === "pending" ? (
          <div className="flex gap-2">
            <form action={approveLeaveRequestAction}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="leaveRequestId" value={r.id} />
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Setujui
              </button>
            </form>
            <form action={rejectLeaveRequestAction}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="leaveRequestId" value={r.id} />
              <button type="submit" className="bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Tolak
              </button>
            </form>
          </div>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Pengajuan Cuti</h1>
        <p className="text-sm text-ink-muted mt-1">
          {session.user.role === "staff"
            ? "Pengajuan cuti milikmu."
            : session.user.role === "department_head"
              ? "Pengajuan cuti di departemenmu."
              : `Semua pengajuan cuti ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <Card title="Ajukan Cuti">
          <form action={createLeaveRequest} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis Cuti</label>
              <select name="leaveTypeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {leaveTypeList.map((lt) => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Mulai</label>
              <DatePicker name="startDate" required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Selesai</label>
              <DatePicker name="endDate" required />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Alasan (opsional)</label>
              <textarea autoComplete="off" name="reason" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Ajukan
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={requestRows} rowKey={(r) => r.id} emptyMessage="Belum ada pengajuan cuti." />
    </div>
  );
}
