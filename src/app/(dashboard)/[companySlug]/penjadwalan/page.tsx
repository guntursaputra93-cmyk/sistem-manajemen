import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, inArray, and } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, serviceAssignments, contracts, organizations, employees, employeeCompetencies } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getActiveContractOptions } from "@/lib/scheduling/assignments";
import { getTerminology } from "@/lib/modules/terminology";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { AssignmentForm } from "./AssignmentForm";

const TERMINOLOGY_DEFAULTS = { personLabel: "Auditor", assignmentLabel: "Penugasan" };

const STATUS_LABEL: Record<string, string> = {
  dijadwalkan: "Dijadwalkan",
  berlangsung: "Berlangsung",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  dijadwalkan: "powder-blue",
  berlangsung: "sage",
  selesai: "sage",
  dibatalkan: "destructive",
};

export default async function PenjadwalanPage({
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

  const canManage = hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS");

  const [assignmentRows, activeContracts, activeEmployees, activeCompetencyRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({
          id: serviceAssignments.id,
          assignmentDate: serviceAssignments.assignmentDate,
          endDate: serviceAssignments.endDate,
          status: serviceAssignments.status,
          employeeId: serviceAssignments.employeeId,
          employeeName: employees.fullName,
          organizationName: organizations.name,
        })
        .from(serviceAssignments)
        .innerJoin(employees, eq(employees.id, serviceAssignments.employeeId))
        .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
        .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
        .where(
          and(
            eq(serviceAssignments.companyId, company.id),
            visibleEmployeeIds ? inArray(serviceAssignments.employeeId, visibleEmployeeIds.length ? visibleEmployeeIds : ["__none__"]) : undefined
          )
        )
        .orderBy(desc(serviceAssignments.assignmentDate))
    ),
    withTenantContext(tenantContext, (tx) => getActiveContractOptions(tx, { companyId: company.id })),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(employees).where(and(eq(employees.companyId, company.id), eq(employees.employmentStatus, "aktif")))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(employeeCompetencies).where(and(eq(employeeCompetencies.companyId, company.id), eq(employeeCompetencies.status, "aktif")))
    ),
  ]);

  const contractOptions = activeContracts.map((c) => ({
    id: c.id,
    label: `${c.organizationName} (${c.startDate}${c.endDate ? ` s/d ${c.endDate}` : ""})`,
    organizationIndustry: c.organizationIndustry,
  }));

  const employeeOptions = activeEmployees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    activeSectorSchemes: activeCompetencyRows.filter((c) => c.employeeId === e.id).map((c) => c.sectorScheme).filter((s): s is string => !!s),
  }));

  const columns: DataTableColumn<(typeof assignmentRows)[number]>[] = [
    {
      key: "date",
      header: "Tanggal",
      render: (a) => (
        <Link href={`/${companySlug}/penjadwalan/${a.id}`} className="font-medium text-sage-deep hover:underline">
          {a.assignmentDate}{a.endDate ? ` s/d ${a.endDate}` : ""}
        </Link>
      ),
    },
    { key: "employee", header: terminology.personLabel, render: (a) => a.employeeName },
    { key: "client", header: "Klien", render: (a) => a.organizationName },
    { key: "status", header: "Status", render: (a) => <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">{terminology.assignmentLabel}</h1>
          <p className="text-sm text-ink-muted mt-1">Penjadwalan {terminology.personLabel.toLowerCase()} ke contract aktif {company.name}.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/${companySlug}/penjadwalan/kalender`} className="text-[11px] font-semibold text-sage-deep hover:underline">
            Lihat Kalender →
          </Link>
          <Link href={`/${companySlug}/penjadwalan/rekap`} className="text-[11px] font-semibold text-sage-deep hover:underline">
            Rekap Tahunan →
          </Link>
        </div>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title={`Buat ${terminology.assignmentLabel} Baru`}>
          <AssignmentForm
            companySlug={companySlug}
            companyId={company.id}
            contracts={contractOptions}
            employees={employeeOptions}
            personLabel={terminology.personLabel}
          />
        </Card>
      )}

      <DataTable columns={columns} rows={assignmentRows} rowKey={(a) => a.id} emptyMessage={`Belum ada ${terminology.assignmentLabel.toLowerCase()} tercatat.`} />
    </div>
  );
}
