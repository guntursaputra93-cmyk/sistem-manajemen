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
      <div className="space-y-6">
        <h1 className="font-display text-[17px] font-extrabold text-ink">Cuti Saya</h1>
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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Cuti Saya</h1>
        <p className="text-sm text-ink-muted mt-1">Saldo dan riwayat pengajuan cutimu.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title={`Saldo Cuti ${currentYear}`}>
        {balanceRows.length === 0 ? (
          <EmptyState message="Belum ada saldo cuti tahun ini — saldo otomatis dibuat saat pengajuan pertamamu disetujui." />
        ) : (
          <ul className="space-y-2 text-sm">
            {balanceRows.map((b) => (
              <li key={b.id} className="flex justify-between border-b border-ink-muted/10 pb-2">
                <span>{leaveTypeList.find((lt) => lt.id === b.leaveTypeId)?.name ?? "-"}</span>
                <span className="text-ink">{b.remaining} / {b.quota} hari tersisa</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canCreate && (
        <Card title="Ajukan Cuti">
          <form action={createLeaveRequestSelf} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

      <Card title="Riwayat Pengajuan">
        {requestRows.length === 0 ? (
          <EmptyState message="Belum ada pengajuan cuti." />
        ) : (
          <ul className="space-y-2 text-sm">
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
  );
}
