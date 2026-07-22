import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, calibrationMeetings, users, attachments } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createCalibrationMeeting } from "./actions";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

export default async function KalibrasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; from?: string; to?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, from, to } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CALIBRATION_MEETINGS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug }));

  const meetingConditions = [eq(calibrationMeetings.companyId, company.id)];
  if (from) meetingConditions.push(gte(calibrationMeetings.meetingDate, from));
  if (to) meetingConditions.push(lte(calibrationMeetings.meetingDate, to));

  const [meetingRows, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(calibrationMeetings).where(and(...meetingConditions)).orderBy(desc(calibrationMeetings.meetingDate))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
  ]);

  // 1 query ter-agregasi (GROUP BY entity_id) untuk hitung lampiran semua rapat
  // yang sedang tampil, BUKAN query per baris — meetingIds baru ada setelah
  // meetingRows di atas selesai, jadi ini query lanjutan, bukan loop N+1.
  const meetingIds = meetingRows.map((m) => m.id);
  const attachmentCountRows = meetingIds.length
    ? await withTenantContext(tenantContext, (tx) =>
        tx
          .select({ entityId: attachments.entityId, count: sql<string>`count(*)` })
          .from(attachments)
          .where(and(eq(attachments.entityType, "kalibrasi"), inArray(attachments.entityId, meetingIds)))
          .groupBy(attachments.entityId)
      )
    : [];
  const attachmentCountByMeeting = new Map(attachmentCountRows.map((r) => [r.entityId, Number(r.count)]));

  const canManage = hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS");

  const columns: DataTableColumn<(typeof meetingRows)[number]>[] = [
    {
      key: "date",
      header: "Tanggal",
      render: (m) => (
        <Link href={`/${companySlug}/sdm/kalibrasi/${m.id}`} className="font-semibold text-sage-deep hover:underline">
          {m.meetingDate}
        </Link>
      ),
    },
    { key: "leader", header: "Pemimpin Rapat", render: (m) => userList.find((u) => u.id === m.leaderUserId)?.fullName ?? "-" },
    { key: "location", header: "Lokasi/Media", render: (m) => m.locationOrMedia ?? "-" },
    { key: "agenda", header: "Agenda", render: (m) => m.agenda ?? "-" },
    {
      key: "attachments",
      header: "Bukti",
      render: (m) => {
        const count = attachmentCountByMeeting.get(m.id) ?? 0;
        return count > 0 ? <span>📎 {count}</span> : <span className="text-ink-muted">—</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "SDM" }, { label: "Rapat Kalibrasi" }]}
        title="Rapat Kalibrasi"
        description={`Notulen rapat kalibrasi tim ${company.name}.`}
        actions={
          canManage && (
            <FormDrawer buttonLabel="Buat Notulen" title="Buat Notulen Rapat Kalibrasi" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createCalibrationMeeting}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Detail Rapat">
                  <FormField label="Tanggal Rapat *">
                    <DatePicker name="meetingDate" required />
                  </FormField>
                  <FormField label="Lokasi/Media" optional>
                    <input autoComplete="off" name="locationOrMedia" placeholder="mis. Ruang Rapat A / Zoom" className={inputClass} />
                  </FormField>
                  <FormField label="Pemimpin Rapat *">
                    <select name="leaderUserId" required className={inputClass}>
                      <option value="">-- pilih --</option>
                      {userList.map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Notulis" optional>
                    <select name="notetakerUserId" className={inputClass}>
                      <option value="">-- tidak ada --</option>
                      {userList.map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Agenda" optional full>
                    <textarea autoComplete="off" name="agenda" rows={3} className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Buat Notulen" />
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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <DatePicker name="from" defaultValue={from} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <DatePicker name="to" defaultValue={to} />
          </div>
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
            Filter
          </button>
          {(from || to) && (
            <Link href={`/${companySlug}/sdm/kalibrasi`} className="text-xs text-ink-muted hover:underline pb-2.5">
              Reset
            </Link>
          )}
        </form>
        <span className="ml-auto text-xs text-ink-muted">{meetingRows.length} rapat</span>
      </div>

      <DataTable columns={columns} rows={meetingRows} rowKey={(m) => m.id} emptyMessage="Belum ada rapat kalibrasi tercatat." />
    </div>
  );
}
