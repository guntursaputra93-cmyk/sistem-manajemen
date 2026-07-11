import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, parse, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getAssignmentsOverlappingRange } from "@/lib/scheduling/assignments";
import { getTerminology } from "@/lib/modules/terminology";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

const TERMINOLOGY_DEFAULTS = { personLabel: "Auditor", assignmentLabel: "Penugasan" };
const STATUS_LABEL: Record<string, string> = { dijadwalkan: "Dijadwalkan", berlangsung: "Berlangsung", selesai: "Selesai", dibatalkan: "Dibatalkan" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { dijadwalkan: "powder-blue", berlangsung: "sage", selesai: "sage", dibatalkan: "destructive" };
const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const ISO = "yyyy-MM-dd";

export default async function PenjadwalanKalenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ month?: string; employeeId?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_SERVICE_ASSIGNMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "penjadwalan_layanan", companySlug }));

  const terminology = await withTenantContext(tenantContext, (tx) =>
    getTerminology(tx, { companyId: company.id, moduleKey: "penjadwalan_layanan", defaults: TERMINOLOGY_DEFAULTS })
  );

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));

  const monthAnchor = sp.month ? parse(sp.month, "yyyy-MM", new Date()) : new Date();
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const employeeIdFilter = sp.employeeId || null;
  const statusFilter = sp.status || null;

  const [assignmentRows, filterEmployees] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      getAssignmentsOverlappingRange(tx, {
        companyId: company.id,
        rangeStart: format(gridStart, ISO),
        rangeEnd: format(gridEnd, ISO),
        visibleEmployeeIds,
        employeeIdFilter,
        statusFilter,
      })
    ),
    withTenantContext(tenantContext, (tx) => {
      // Dropdown filter per personil: admin/super_admin lihat semua karyawan aktif,
      // department_head lihat karyawan di lingkup timnya (visibleEmployeeIds > 1),
      // staff (cuma lihat diri sendiri, visibleEmployeeIds.length <= 1) tidak perlu dropdown.
      if (visibleEmployeeIds === null) {
        return tx.select().from(employees).where(eq(employees.companyId, company.id));
      }
      if (visibleEmployeeIds.length > 1) {
        return tx.select().from(employees).where(and(eq(employees.companyId, company.id), inArray(employees.id, visibleEmployeeIds)));
      }
      return Promise.resolve([]);
    }),
  ]);

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) days.push(d);

  function assignmentsForDay(day: Date) {
    const dayStr = format(day, ISO);
    return assignmentRows.filter((a) => a.assignmentDate <= dayStr && (a.endDate ?? a.assignmentDate) >= dayStr);
  }

  const prevMonthParam = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonthParam = format(addMonths(monthStart, 1), "yyyy-MM");
  const currentMonthParam = format(monthStart, "yyyy-MM");

  function navUrl(monthParam: string) {
    const qs = new URLSearchParams();
    qs.set("month", monthParam);
    if (employeeIdFilter) qs.set("employeeId", employeeIdFilter);
    if (statusFilter) qs.set("status", statusFilter);
    return `/${companySlug}/penjadwalan/kalender?${qs.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/${companySlug}/penjadwalan`} className="text-[11px] text-sage-deep hover:underline">← Daftar {terminology.assignmentLabel}</Link>
          <h1 className="font-display text-[17px] font-extrabold text-ink mt-1">Kalender {terminology.assignmentLabel}</h1>
          <p className="text-sm text-ink-muted mt-1">Tampilan lintas klien — tanpa deteksi bentrok jadwal (sesuai keputusan spesifikasi).</p>
        </div>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="month" value={currentMonthParam} />
          {filterEmployees.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">{terminology.personLabel}</label>
              <select name="employeeId" defaultValue={employeeIdFilter ?? ""} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">Semua</option>
                {filterEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Status</label>
            <select name="status" defaultValue={statusFilter ?? ""} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
              <option value="">Semua</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Filter
          </button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Link href={navUrl(prevMonthParam)} className="text-[11px] font-semibold text-sage-deep hover:underline">← Bulan Sebelumnya</Link>
          <h2 className="font-display text-[13px] font-bold text-ink capitalize">{format(monthStart, "MMMM yyyy", { locale: idLocale })}</h2>
          <Link href={navUrl(nextMonthParam)} className="text-[11px] font-semibold text-sage-deep hover:underline">Bulan Berikutnya →</Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-ink-muted uppercase mb-1">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayAssignments = assignmentsForDay(day);
            const inMonth = isSameMonth(day, monthStart);
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[92px] rounded-lg border p-1.5 text-left align-top ${
                  inMonth ? "border-ink-muted/12 bg-bg-base" : "border-ink-muted/5 bg-transparent"
                }`}
              >
                <p className={`text-[10px] font-semibold mb-1 ${inMonth ? "text-ink" : "text-ink-muted/40"} ${isToday(day) ? "text-sage-deep" : ""}`}>
                  {format(day, "d")}
                </p>
                <div className="space-y-0.5">
                  {dayAssignments.slice(0, 3).map((a) => (
                    <Link
                      key={a.id}
                      href={`/${companySlug}/penjadwalan/${a.id}`}
                      className="block truncate rounded px-1 py-0.5 text-[9.5px] font-medium bg-sage/20 text-ink hover:bg-sage/30"
                      title={`${a.employeeName} — ${a.organizationName} (${STATUS_LABEL[a.status]})`}
                    >
                      {a.employeeName.split(" ")[0]} — {a.organizationName}
                    </Link>
                  ))}
                  {dayAssignments.length > 3 && (
                    <p className="text-[9px] text-ink-muted px-1">+{dayAssignments.length - 3} lainnya</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Legenda Status">
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <Badge key={value} variant={STATUS_VARIANT[value]}>{label}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
