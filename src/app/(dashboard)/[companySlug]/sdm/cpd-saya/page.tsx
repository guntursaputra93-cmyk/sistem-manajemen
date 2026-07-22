import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, cpdActivities } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { getCpdHoursSummary } from "@/lib/hr/cpd";
import { createCpdActivitySelf } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const CATEGORY_LABEL: Record<string, string> = { internal: "Internal", eksternal: "Eksternal" };

export default async function CpdSayaPage({
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

  if (!hasPermission(session.user.role, "VIEW_CPD_ACTIVITIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug }));

  const employee = await withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId: company.id, userId: session.user.id }));

  if (!employee) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "SDM" }, { label: "Logbook CPD Saya" }]} title="Logbook CPD Saya" />
        <EmptyState message="Akun Anda belum terhubung ke data karyawan — hubungi admin." />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const canCreate = hasPermission(session.user.role, "CREATE_CPD_ACTIVITY");

  const [activityRows, summary] = await withTenantContext(tenantContext, async (tx) => {
    const activities = await tx.select().from(cpdActivities).where(eq(cpdActivities.employeeId, employee.id)).orderBy(desc(cpdActivities.year), desc(cpdActivities.activityDate));
    const s = await getCpdHoursSummary(tx, { companyId: company.id, employeeId: employee.id, year: currentYear });
    return [activities, s] as const;
  });

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Logbook CPD Saya" }]}
        title="Logbook CPD Saya"
        description={employee.fullName}
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Catat Aktivitas" title="Catat Aktivitas CPD" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createCpdActivitySelf}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="① Aktivitas">
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

      {success && (
        <div className="mb-4 rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">
          Berhasil disimpan.
        </div>
      )}

      <div className="space-y-5">
        <Card
          title={`Ringkasan ${currentYear}`}
          description={summary.targetHours != null ? `Target tahunan: ${summary.targetHours} jam.` : "Target tahunan belum diatur admin."}
        >
          <p className={`text-lg font-semibold ${summary.met === false ? "text-destructive" : "text-ink"}`}>
            {summary.totalHours} jam{summary.targetHours != null ? ` / ${summary.targetHours} jam` : ""}
          </p>
        </Card>

        <Card title="Riwayat Aktivitas">
          {activityRows.length === 0 ? (
            <EmptyState message="Belum ada aktivitas CPD tercatat." />
          ) : (
            <ul className="space-y-2 text-[13px]">
              {activityRows.map((a) => (
                <li key={a.id} className="border-b border-ink-muted/10 pb-2">
                  <span className="font-semibold text-ink">{a.activityName}</span>
                  <span className="text-ink-muted"> — {CATEGORY_LABEL[a.category]} — {Number(a.durationHours)} jam — {a.year}</span>
                  {a.organizer && <div className="text-ink-muted text-xs">{a.organizer}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
