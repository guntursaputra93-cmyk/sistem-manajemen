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
      <div className="space-y-6">
        <h1 className="font-display text-[17px] font-extrabold text-ink">Logbook CPD Saya</h1>
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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Logbook CPD Saya</h1>
        <p className="text-sm text-ink-muted mt-1">{employee.fullName}</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card
        title={`Ringkasan ${currentYear}`}
        description={summary.targetHours != null ? `Target tahunan: ${summary.targetHours} jam.` : "Target tahunan belum diatur admin."}
      >
        <p className={`text-lg font-semibold ${summary.met === false ? "text-destructive" : "text-ink"}`}>
          {summary.totalHours} jam{summary.targetHours != null ? ` / ${summary.targetHours} jam` : ""}
        </p>
      </Card>

      {canCreate && (
        <Card title="Catat Aktivitas CPD">
          <form action={createCpdActivitySelf} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
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
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Bukti Aktivitas (PDF)</label>
              <input
                name="attachmentFile"
                type="file"
                accept="application/pdf"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base file:mr-3 file:rounded-md file:border-0 file:bg-sage/20 file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-sage-deep"
              />
              <p className="text-[10px] text-ink-muted mt-1">
                Bukti wajib diunggah (PDF) — aktivitas tanpa bukti tidak dapat dicatat (persyaratan Kemnaker).
              </p>
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Catat
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Riwayat Aktivitas">
        {activityRows.length === 0 ? (
          <EmptyState message="Belum ada aktivitas CPD tercatat." />
        ) : (
          <ul className="space-y-2 text-sm">
            {activityRows.map((a) => (
              <li key={a.id} className="border-b border-ink-muted/10 pb-2">
                <span className="font-medium text-ink">{a.activityName}</span>
                <span className="text-ink-muted"> — {CATEGORY_LABEL[a.category]} — {Number(a.durationHours)} jam — {a.year}</span>
                {a.organizer && <div className="text-ink-muted text-xs">{a.organizer}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
