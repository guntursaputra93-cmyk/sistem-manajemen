import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getAnnualAuditExperience } from "@/lib/scheduling/experience";
import { getTerminology } from "@/lib/modules/terminology";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

const TERMINOLOGY_DEFAULTS = { personLabel: "Auditor", assignmentLabel: "Penugasan" };

export default async function PenjadwalanRekapPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ year?: string }>;
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

  const currentYear = new Date().getFullYear();
  const year = sp.year ? Number(sp.year) : currentYear;

  const experienceRows = await withTenantContext(tenantContext, (tx) =>
    getAnnualAuditExperience(tx, { companyId: company.id, year, visibleEmployeeIds })
  );

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const columns: DataTableColumn<(typeof experienceRows)[number]>[] = [
    { key: "employee", header: terminology.personLabel, render: (r) => r.employeeName },
    { key: "count", header: `Jumlah ${terminology.assignmentLabel}`, render: (r) => r.assignmentCount },
    { key: "days", header: "Total Hari", render: (r) => r.totalDays },
    { key: "clients", header: "Klien", render: (r) => (r.clients.length ? r.clients.join(", ") : "-") },
    { key: "sectors", header: "Sektor", render: (r) => (r.sectors.length ? r.sectors.join(", ") : "-") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/${companySlug}/penjadwalan`} className="text-[11px] text-sage-deep hover:underline">← Daftar {terminology.assignmentLabel}</Link>
        <h1 className="font-display text-[17px] font-extrabold text-ink mt-1">Rekap Pengalaman Audit Tahunan</h1>
        <p className="text-sm text-ink-muted mt-1">
          Agregat {terminology.assignmentLabel.toLowerCase()} berstatus selesai — jumlah, total hari, klien, dan sektor per {terminology.personLabel.toLowerCase()}.
        </p>
      </div>

      <Card>
        <form method="get" className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tahun</label>
            <select name="year" defaultValue={String(year)} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Tampilkan
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={experienceRows} rowKey={(r) => r.employeeId} emptyMessage={`Belum ada ${terminology.assignmentLabel.toLowerCase()} selesai di tahun ${year}.`} />
    </div>
  );
}
