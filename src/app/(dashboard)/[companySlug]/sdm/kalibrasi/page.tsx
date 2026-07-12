import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, calibrationMeetings, users, attachments } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createCalibrationMeeting } from "./actions";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

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
        <Link href={`/${companySlug}/sdm/kalibrasi/${m.id}`} className="font-medium text-sage-deep hover:underline">
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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Rapat Kalibrasi</h1>
        <p className="text-sm text-ink-muted mt-1">Notulen rapat kalibrasi tim {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Buat Notulen Rapat Kalibrasi">
          <form action={createCalibrationMeeting} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Rapat</label>
              <DatePicker name="meetingDate" required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Lokasi/Media (opsional)</label>
              <input autoComplete="off" name="locationOrMedia" placeholder="mis. Ruang Rapat A / Zoom" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Pemimpin Rapat</label>
              <select name="leaderUserId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Notulis (opsional)</label>
              <select name="notetakerUserId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Agenda (opsional)</label>
              <textarea autoComplete="off" name="agenda" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Buat Notulen
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Rekap Kalibrasi">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Dari Tanggal</label>
            <DatePicker name="from" defaultValue={from} />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Sampai Tanggal</label>
            <DatePicker name="to" defaultValue={to} />
          </div>
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Filter
          </button>
          {(from || to) && (
            <Link href={`/${companySlug}/sdm/kalibrasi`} className="text-[11px] text-ink-muted hover:underline">
              Reset
            </Link>
          )}
        </form>
      </Card>

      <DataTable columns={columns} rows={meetingRows} rowKey={(m) => m.id} emptyMessage="Belum ada rapat kalibrasi tercatat." />
    </div>
  );
}
