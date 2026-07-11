import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employeeCompetencies, competencyTypes, employees, attachments } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { expireOverdueEmployeeCompetencies, getExpiringCompetencies } from "@/lib/hr/competencies";
import { createEmployeeCompetency, updateEmployeeCompetency } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";

const STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  kedaluwarsa: "Kedaluwarsa",
  proses_perpanjangan: "Proses Perpanjangan",
};

const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  aktif: "sage",
  kedaluwarsa: "destructive",
  proses_perpanjangan: "powder-blue",
};

export default async function KompetensiPage({
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

  if (!hasPermission(session.user.role, "VIEW_EMPLOYEE_COMPETENCIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug }));

  await withTenantContext(tenantContext, (tx) => expireOverdueEmployeeCompetencies(tx, { companyId: company.id }));

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));

  const [competencyRows, expiringRows, typeList, empList, attachmentRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(employeeCompetencies)
        .where(
          visibleEmployeeIds
            ? and(eq(employeeCompetencies.companyId, company.id), inArray(employeeCompetencies.employeeId, visibleEmployeeIds))
            : eq(employeeCompetencies.companyId, company.id)
        )
        .orderBy(asc(employeeCompetencies.expiresAt))
    ),
    withTenantContext(tenantContext, (tx) => getExpiringCompetencies(tx, { companyId: company.id, withinMonths: 3 })),
    withTenantContext(tenantContext, (tx) => tx.select().from(competencyTypes).where(eq(competencyTypes.companyId, company.id)).orderBy(asc(competencyTypes.name))),
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
    withTenantContext(tenantContext, (tx) => tx.select().from(attachments).where(eq(attachments.entityType, "employee_competency"))),
  ]);

  const canManage = hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES");
  const visibleExpiring = visibleEmployeeIds ? expiringRows.filter((r) => visibleEmployeeIds.includes(r.employeeId)) : expiringRows;

  const columns: DataTableColumn<(typeof competencyRows)[number]>[] = [
    { key: "employee", header: "Karyawan", render: (r) => empList.find((e) => e.id === r.employeeId)?.fullName ?? "-" },
    { key: "type", header: "Jenis", render: (r) => typeList.find((t) => t.id === r.competencyTypeId)?.name ?? "-" },
    { key: "sector", header: "Skema Sektor", render: (r) => r.sectorScheme ?? "-" },
    { key: "cert", header: "No. Sertifikat", render: (r) => r.certificateNumber ?? "-" },
    { key: "expires", header: "Berlaku Sampai", render: (r) => r.expiresAt ?? "-" },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "powder-blue"}>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: "actions",
      header: "Aksi",
      render: (r) =>
        canManage ? (
          <details>
            <summary className="text-sage-deep hover:underline text-xs cursor-pointer inline">Kelola</summary>
            <div className="mt-2 space-y-3 w-72">
              <form action={updateEmployeeCompetency} className="space-y-2">
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="employeeCompetencyId" value={r.id} />
                <div>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">No. Sertifikat</label>
                  <input autoComplete="off" name="certificateNumber" defaultValue={r.certificateNumber ?? ""} className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-bg-base" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">Skema Sektor</label>
                  <input autoComplete="off" name="sectorScheme" defaultValue={r.sectorScheme ?? ""} className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-bg-base" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">Berlaku Sampai</label>
                  <DatePicker name="expiresAt" defaultValue={r.expiresAt} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">Status</label>
                  <select name="status" defaultValue={r.status} className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-bg-base">
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                  Edit
                </button>
              </form>
              <div>
                <p className="text-xs font-medium text-ink-muted mb-1">Sertifikat (PDF)</p>
                <AttachmentUploader entityType="employee_competency" entityId={r.id} attachments={attachmentRows.filter((a) => a.entityId === r.id)} />
              </div>
            </div>
          </details>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Kompetensi & Sertifikasi</h1>
        <p className="text-sm text-ink-muted mt-1">
          {session.user.role === "staff" ? "Kompetensi milikmu." : session.user.role === "department_head" ? "Kompetensi di departemenmu." : `Kompetensi ${company.name}.`}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Akan Kedaluwarsa (≤3 Bulan)">
        {visibleExpiring.length === 0 ? (
          <EmptyState message="Tidak ada kompetensi yang akan kedaluwarsa dalam 3 bulan ke depan." />
        ) : (
          <ul className="space-y-2 text-sm">
            {visibleExpiring.map((r) => (
              <li key={r.id} className="flex justify-between border-b border-ink-muted/10 pb-2">
                <span>
                  {empList.find((e) => e.id === r.employeeId)?.fullName ?? "-"} — {typeList.find((t) => t.id === r.competencyTypeId)?.name ?? "-"}
                </span>
                <span className="text-destructive font-medium">{r.expiresAt}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <Card title="Assign Kompetensi ke Karyawan">
          <form action={createEmployeeCompetency} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis Kompetensi</label>
              <select name="competencyTypeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {typeList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Skema Sektor (opsional)</label>
              <input autoComplete="off" name="sectorScheme" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">No. Sertifikat</label>
              <input autoComplete="off" name="certificateNumber" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Terbit</label>
              <DatePicker name="issuedDate" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Berlaku Sampai</label>
              <DatePicker name="expiresAt" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Assign
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={competencyRows} rowKey={(r) => r.id} emptyMessage="Belum ada kompetensi tercatat." />
    </div>
  );
}
