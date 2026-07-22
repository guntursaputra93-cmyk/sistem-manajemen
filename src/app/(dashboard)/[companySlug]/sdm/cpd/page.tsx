import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, cpdActivities, cpdSettings, employees } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getCpdHoursSummaryBatch } from "@/lib/hr/cpd";
import { createCpdActivity, updateCpdSettings } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
  searchParams: Promise<{ error?: string; success?: string; employeeId?: string; yearFrom?: string; yearTo?: string }>;
}) {
  const { companySlug } = await params;
  const { error, employeeId: employeeIdParam, yearFrom: yearFromParam, yearTo: yearToParam } = await searchParams;
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
  const parsedYearFrom = Number(yearFromParam);
  const parsedYearTo = Number(yearToParam);
  const yearFrom = Number.isFinite(parsedYearFrom) && yearFromParam ? parsedYearFrom : currentYear;
  const yearTo = Number.isFinite(parsedYearTo) && yearToParam ? parsedYearTo : currentYear;
  const rangeFrom = Math.min(yearFrom, yearTo);
  const rangeTo = Math.max(yearFrom, yearTo);
  const yearSpan = rangeTo - rangeFrom + 1;

  // "Semua" kalau kosong ATAU bukan salah satu karyawan yang boleh dilihat viewer ini.
  const selectedEmployeeId = employeeIdParam && (visibleEmployeeIds === null || visibleEmployeeIds.includes(employeeIdParam)) ? employeeIdParam : null;

  // Filter tabel rekap (karyawan + rentang tahun) langsung di WHERE — sama
  // seperti ringkasan jam di atas, supaya keduanya dikendalikan 1 filter yang
  // sama dan tidak ada 2 filter berbeda yang membingungkan di halaman ini.
  const activityConditions = [eq(cpdActivities.companyId, company.id), gte(cpdActivities.year, rangeFrom), lte(cpdActivities.year, rangeTo)];
  if (visibleEmployeeIds) activityConditions.push(inArray(cpdActivities.employeeId, visibleEmployeeIds));
  if (selectedEmployeeId) activityConditions.push(eq(cpdActivities.employeeId, selectedEmployeeId));

  const [activityRows, empList, settingsRow, hoursByEmployee] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(cpdActivities)
        .where(and(...activityConditions))
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
    withTenantContext(tenantContext, (tx) =>
      getCpdHoursSummaryBatch(tx, {
        companyId: company.id,
        employeeIds: selectedEmployeeId ? [selectedEmployeeId] : visibleEmployeeIds,
        yearFrom: rangeFrom,
        yearTo: rangeTo,
      })
    ),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_CPD_ACTIVITY");
  const canManageSettings = hasPermission(session.user.role, "MANAGE_CPD_SETTINGS");
  const currentTarget = settingsRow[0]?.annualTargetHours ?? null;
  // Target tahunan dikali jumlah tahun dalam rentang — supaya perbandingan tetap
  // masuk akal saat admin memfilter lebih dari 1 tahun sekaligus.
  const rangeTarget = currentTarget != null ? Number(currentTarget) * yearSpan : null;

  const filteredEmpList = selectedEmployeeId ? empList.filter((e) => e.id === selectedEmployeeId) : empList;
  const summaries = filteredEmpList.map((e) => ({
    employee: e,
    summary: {
      totalHours: hoursByEmployee.get(e.id) ?? 0,
      targetHours: rangeTarget,
      met: rangeTarget != null ? (hoursByEmployee.get(e.id) ?? 0) >= rangeTarget : null,
    },
  }));

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
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Logbook CPD" }]}
        title="Logbook CPD"
        description={`Continuing Professional Development — ${company.name}.`}
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Catat Aktivitas" title="Catat Aktivitas CPD" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createCpdActivity}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="① Aktivitas">
                  <FormField label="Karyawan *" full>
                    <select name="employeeId" required className={inputClass}>
                      <option value="">-- pilih --</option>
                      {empList.map((e) => (
                        <option key={e.id} value={e.id}>{e.fullName}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Nama Aktivitas *" full>
                    <input autoComplete="off" name="activityName" required className={inputClass} />
                  </FormField>
                  <FormField label="Kategori *">
                    <select name="category" required className={inputClass}>
                      <option value="internal">Internal</option>
                      <option value="eksternal">Eksternal</option>
                    </select>
                  </FormField>
                  <FormField label="Penyelenggara" optional>
                    <input autoComplete="off" name="organizer" className={inputClass} />
                  </FormField>
                </FormSection>
                <FormSection title="② Waktu & Durasi">
                  <FormField label="Durasi (jam) *">
                    <input autoComplete="off" name="durationHours" type="number" step="0.5" min={0} required className={inputClass} />
                  </FormField>
                  <FormField label="Tahun *">
                    <input autoComplete="off" name="year" type="number" defaultValue={currentYear} required className={inputClass} />
                  </FormField>
                  <FormField label="Tanggal" optional>
                    <DatePicker name="activityDate" />
                  </FormField>
                </FormSection>
                <FormSection title="③ Bukti">
                  <FormField
                    label="Bukti Aktivitas (PDF) *"
                    full
                    hint="Bukti wajib diunggah (PDF) — aktivitas tanpa bukti tidak dapat dicatat (persyaratan Kemnaker)."
                  >
                    <input
                      name="attachmentFile"
                      type="file"
                      accept="application/pdf"
                      required
                      className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-sage/20 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-sage-deep`}
                    />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Catat Aktivitas" />
              </form>
            </FormDrawer>
          )
        }
      />

      <div className="space-y-5">
        <Card
          title={`Ringkasan Jam CPD ${rangeFrom === rangeTo ? rangeFrom : `${rangeFrom}–${rangeTo}`}`}
          description={rangeTarget != null ? `Target periode: ${rangeTarget} jam${yearSpan > 1 ? ` (${currentTarget} jam/tahun × ${yearSpan} tahun)` : ""}.` : "Target tahunan belum diatur admin."}
        >
          {summaries.length === 0 ? (
            <p className="text-[13px] text-ink-muted italic">Belum ada karyawan untuk ditampilkan.</p>
          ) : (
            <ul className="space-y-2.5">
              {summaries.map(({ employee, summary }) => {
                const pct = rangeTarget ? Math.max(0, Math.min(100, Math.round((summary.totalHours / rangeTarget) * 100))) : null;
                return (
                  <li key={employee.id} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage/20 text-[11px] font-bold text-sage-deep">
                      {initials(employee.fullName)}
                    </span>
                    <p className="text-[13px] font-semibold text-ink truncate flex-1 min-w-0">{employee.fullName}</p>
                    {pct !== null && (
                      <div className="h-1.5 w-24 shrink-0 rounded-full bg-sage/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-[width] ${summary.met ? "bg-sage-deep" : "bg-dusty-rose-deep"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <span className="text-xs text-ink-muted whitespace-nowrap shrink-0">
                      <span className="font-bold text-ink">{summary.totalHours}</span>
                      {rangeTarget != null ? ` / ${rangeTarget} jam` : " jam"}
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
            <form action={updateCpdSettings} className="flex items-end gap-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Target Jam CPD per Tahun</label>
                <input
                  autoComplete="off"
                  name="annualTargetHours"
                  type="number"
                  step="0.5"
                  min={0}
                  defaultValue={currentTarget ?? ""}
                  className={inputClass}
                />
              </div>
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
                Simpan
              </button>
            </form>
          </Card>
        )}

        <Card title="Rekap Aktivitas CPD">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Karyawan</label>
              <select name="employeeId" defaultValue={selectedEmployeeId ?? ""} className={inputClass}>
                <option value="">-- Semua Karyawan --</option>
                {empList.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tahun</label>
              <input autoComplete="off" name="yearFrom" type="number" defaultValue={rangeFrom} className={`${inputClass} w-28`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tahun</label>
              <input autoComplete="off" name="yearTo" type="number" defaultValue={rangeTo} className={`${inputClass} w-28`} />
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
              Filter
            </button>
          </form>
        </Card>

        <DataTable columns={columns} rows={activityRows} rowKey={(r) => r.id} emptyMessage="Belum ada aktivitas CPD tercatat." />
      </div>
    </div>
  );
}
