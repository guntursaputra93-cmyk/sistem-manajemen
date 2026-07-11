import { notFound, redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, cpdActivities, cpdSettings, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getCpdHoursSummary } from "@/lib/hr/cpd";
import { createCpdActivity, updateCpdSettings } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";

const CATEGORY_LABEL: Record<string, string> = { internal: "Internal", eksternal: "Eksternal" };

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function CpdPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CPD_ACTIVITIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug }));

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));

  const currentYear = new Date().getFullYear();

  const [activityRows, empList, settingsRow] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(cpdActivities)
        .where(
          visibleEmployeeIds
            ? and(eq(cpdActivities.companyId, company.id), inArray(cpdActivities.employeeId, visibleEmployeeIds))
            : eq(cpdActivities.companyId, company.id)
        )
        .orderBy(desc(cpdActivities.year), desc(cpdActivities.activityDate))
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
    withTenantContext(tenantContext, (tx) => tx.select().from(cpdSettings).where(eq(cpdSettings.companyId, company.id))),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_CPD_ACTIVITY");
  const canManageSettings = hasPermission(session.user.role, "MANAGE_CPD_SETTINGS");
  const currentTarget = settingsRow[0]?.annualTargetHours ?? null;

  const summaries = await Promise.all(
    empList.map(async (e) => ({
      employee: e,
      summary: await withTenantContext(tenantContext, (tx) => getCpdHoursSummary(tx, { companyId: company.id, employeeId: e.id, year: currentYear })),
    }))
  );

  const columns: DataTableColumn<(typeof activityRows)[number]>[] = [
    { key: "employee", header: "Karyawan", render: (r) => empList.find((e) => e.id === r.employeeId)?.fullName ?? "-" },
    { key: "activity", header: "Aktivitas", render: (r) => r.activityName },
    { key: "category", header: "Kategori", render: (r) => CATEGORY_LABEL[r.category] ?? r.category },
    { key: "organizer", header: "Penyelenggara", render: (r) => r.organizer ?? "-" },
    { key: "hours", header: "Jam", render: (r) => Number(r.durationHours) },
    { key: "date", header: "Tanggal", render: (r) => r.activityDate ?? "-" },
    { key: "year", header: "Tahun", render: (r) => r.year },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Logbook CPD</h1>
        <p className="text-sm text-ink-muted mt-1">Continuing Professional Development — {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}

      <Card title={`Ringkasan Jam CPD ${currentYear}`} description={currentTarget != null ? `Target tahunan: ${currentTarget} jam.` : "Target tahunan belum diatur admin."}>
        {summaries.length === 0 ? (
          <p className="text-[11px] text-ink-muted italic">Belum ada karyawan untuk ditampilkan.</p>
        ) : (
          <ul className="space-y-2.5">
            {summaries.map(({ employee, summary }) => {
              const pct = currentTarget ? Math.max(0, Math.min(100, Math.round((summary.totalHours / Number(currentTarget)) * 100))) : null;
              return (
                <li key={employee.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage/20 text-[10px] font-bold text-sage-deep">
                    {initials(employee.fullName)}
                  </span>
                  <p className="text-[11px] font-bold text-ink truncate flex-1 min-w-0">{employee.fullName}</p>
                  {pct !== null && (
                    <div className="h-1.5 w-20 shrink-0 rounded-full bg-sage/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] ${summary.met ? "bg-sage-deep" : "bg-dusty-rose-deep"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <span className="text-[11px] text-ink-muted whitespace-nowrap shrink-0">
                    <span className="font-bold text-ink">{summary.totalHours}</span>
                    {currentTarget != null ? ` / ${currentTarget} jam` : " jam"}
                  </span>
                  {summary.met !== null && (
                    <Badge variant={summary.met ? "sage" : "dusty-rose"}>{summary.met ? "Tercapai" : "Belum Tercapai"}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canManageSettings && (
        <Card title="Pengaturan Target CPD">
          <form action={updateCpdSettings} className="flex items-end gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Target Jam CPD per Tahun</label>
              <input autoComplete="off"
                name="annualTargetHours"
                type="number"
                step="0.5"
                min={0}
                defaultValue={currentTarget ?? ""}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Edit
            </button>
          </form>
        </Card>
      )}

      {canCreate && (
        <Card title="Catat Aktivitas CPD">
          <form action={createCpdActivity} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Karyawan</label>
              <select name="employeeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {empList.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Aktivitas</label>
              <input autoComplete="off" name="activityName" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kategori</label>
              <select name="category" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="internal">Internal</option>
                <option value="eksternal">Eksternal</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Penyelenggara (opsional)</label>
              <input autoComplete="off" name="organizer" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Durasi (jam)</label>
              <input autoComplete="off" name="durationHours" type="number" step="0.5" min={0} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal (opsional)</label>
              <DatePicker name="activityDate" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
              <input autoComplete="off" name="year" type="number" defaultValue={currentYear} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Catat
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={activityRows} rowKey={(r) => r.id} emptyMessage="Belum ada aktivitas CPD tercatat." />
    </div>
  );
}
