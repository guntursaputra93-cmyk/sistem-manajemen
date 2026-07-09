import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, calibrationMeetings, users } from "@/drizzle/schema";
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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
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

  const [meetingRows, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(calibrationMeetings).where(eq(calibrationMeetings.companyId, company.id)).orderBy(desc(calibrationMeetings.meetingDate))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
  ]);

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
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Rapat Kalibrasi</h1>
        <p className="text-sm text-ink-muted mt-1">Notulen rapat kalibrasi tim {company.name}.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Buat Notulen Rapat Kalibrasi">
          <form action={createCalibrationMeeting} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal Rapat</label>
              <DatePicker name="meetingDate" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Lokasi/Media (opsional)</label>
              <input name="locationOrMedia" placeholder="mis. Ruang Rapat A / Zoom" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Pemimpin Rapat</label>
              <select name="leaderUserId" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                <option value="">-- pilih --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Notulis (opsional)</label>
              <select name="notetakerUserId" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Agenda (opsional)</label>
              <textarea name="agenda" rows={2} className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Buat Notulen
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={meetingRows} rowKey={(m) => m.id} emptyMessage="Belum ada rapat kalibrasi tercatat." />
    </div>
  );
}
