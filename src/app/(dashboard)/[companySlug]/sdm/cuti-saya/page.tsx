import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, leaveBalances, leaveRequests, leaveTypes } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { createLeaveRequestSelf } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan" };
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  pending: "powder-blue",
  approved: "sage",
  rejected: "destructive",
  cancelled: "dusty-rose",
};

export default async function CutiSayaPage({
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

  if (!hasPermission(session.user.role, "VIEW_LEAVE_BALANCES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_cuti_absensi", companySlug }));

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId: company.id, userId: session.user.id }));

  if (!employee) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "SDM" }, { label: "Cuti Saya" }]} title="Cuti Saya" />
        <EmptyState message="Akun Anda belum terhubung ke data karyawan — hubungi admin." />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const canCreate = hasPermission(session.user.role, "CREATE_LEAVE_REQUEST");

  const [balanceRows, requestRows, leaveTypeList] = await withTenantContext(tenantContext, async (tx) => {
    const balances = await tx.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, currentYear)));
    const requests = await tx.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employee.id)).orderBy(desc(leaveRequests.createdAt));
    const types = await tx.select().from(leaveTypes).where(eq(leaveTypes.companyId, company.id));
    return [balances, requests, types] as const;
  });

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Cuti Saya" }]}
        title="Cuti Saya"
        description="Saldo dan riwayat pengajuan cutimu."
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Ajukan Cuti" title="Ajukan Cuti" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createLeaveRequestSelf}>
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

      <div className="space-y-5">
        <Card title={`Saldo Cuti ${currentYear}`}>
          {balanceRows.length === 0 ? (
            <EmptyState message="Belum ada saldo cuti tahun ini — saldo otomatis dibuat saat pengajuan pertamamu disetujui." />
          ) : (
            <ul className="space-y-2 text-[13px]">
              {balanceRows.map((b) => (
                <li key={b.id} className="flex justify-between border-b border-ink-muted/10 pb-2">
                  <span>{leaveTypeList.find((lt) => lt.id === b.leaveTypeId)?.name ?? "-"}</span>
                  <span className="font-semibold text-ink">{b.remaining} / {b.quota} hari tersisa</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Riwayat Pengajuan">
          {requestRows.length === 0 ? (
            <EmptyState message="Belum ada pengajuan cuti." />
          ) : (
            <ul className="space-y-2 text-[13px]">
              {requestRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-ink-muted/10 pb-2">
                  <span>
                    {leaveTypeList.find((lt) => lt.id === r.leaveTypeId)?.name ?? "-"} — {r.startDate} s/d {r.endDate} ({r.totalDays} hari)
                  </span>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
