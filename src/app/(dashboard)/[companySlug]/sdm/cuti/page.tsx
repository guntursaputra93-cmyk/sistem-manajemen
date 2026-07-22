import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, leaveRequests, leaveTypes, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, getEmployeeByUserId, resolveViewer } from "@/lib/hr/employees";
import { createLeaveRequest, approveLeaveRequestAction, rejectLeaveRequestAction } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";

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
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, status } = await searchParams;
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

  // Penyaringan server-side dari ?q= / ?status= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const filtered = requestRows.filter((r) => {
    if (needle) {
      const empName = empList.find((e) => e.id === r.employeeId)?.fullName ?? "";
      const typeName = leaveTypeList.find((lt) => lt.id === r.leaveTypeId)?.name ?? "";
      if (!`${empName} ${typeName}`.toLowerCase().includes(needle)) return false;
    }
    if (status && r.status !== status) return false;
    return true;
  });

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
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                Setujui
              </button>
            </form>
            <form action={rejectLeaveRequestAction}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="leaveRequestId" value={r.id} />
              <button type="submit" className="bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
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
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Pengajuan Cuti" }]}
        title="Pengajuan Cuti"
        description={
          session.user.role === "staff"
            ? "Pengajuan cuti milikmu."
            : session.user.role === "department_head"
              ? "Pengajuan cuti di departemenmu."
              : `Semua pengajuan cuti ${company.name}.`
        }
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Ajukan Cuti" title="Ajukan Cuti" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createLeaveRequest}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Detail Pengajuan">
                  <FormField label="Jenis Cuti *" full>
                    <select name="leaveTypeId" required className={inputClass}>
                      <option value="">-- pilih --</option>
                      {leaveTypeList.map((lt) => (
                        <option key={lt.id} value={lt.id}>{lt.name}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Tanggal Mulai *">
                    <DatePicker name="startDate" required />
                  </FormField>
                  <FormField label="Tanggal Selesai *">
                    <DatePicker name="endDate" required />
                  </FormField>
                  <FormField label="Alasan" optional full>
                    <textarea autoComplete="off" name="reason" rows={3} className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Ajukan Cuti" />
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
        searchPlaceholder="Cari nama karyawan atau jenis cuti…"
        filters={[
          {
            name: "status",
            allLabel: "Semua Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        countLabel={`${filtered.length} pengajuan`}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyMessage={needle || status ? "Tidak ada pengajuan yang cocok dengan pencarian/filter." : "Belum ada pengajuan cuti."}
      />
    </div>
  );
}
