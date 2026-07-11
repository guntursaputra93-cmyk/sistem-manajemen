import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, calibrationMeetings, calibrationAttendees, users, employees } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { updateCalibrationMeeting, addAttendee, toggleAttendeeSigned } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";

export default async function KalibrasiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
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

  const [meeting] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(calibrationMeetings).where(and(eq(calibrationMeetings.id, id), eq(calibrationMeetings.companyId, company.id)))
  );
  if (!meeting) notFound();

  const [attendeeRows, userList, empList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(calibrationAttendees).where(eq(calibrationAttendees.meetingId, meeting.id)).orderBy(asc(calibrationAttendees.attendeeName))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(employees).where(eq(employees.companyId, company.id))),
  ]);

  const canManage = hasPermission(session.user.role, "MANAGE_CALIBRATION_MEETINGS");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Rapat Kalibrasi — {meeting.meetingDate}</h1>
        <p className="text-sm text-ink-muted mt-1">Pemimpin: {userList.find((u) => u.id === meeting.leaderUserId)?.fullName ?? "-"}</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Detail Notulen">
        {canManage ? (
          <form action={updateCalibrationMeeting} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="meetingId" value={meeting.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Rapat</label>
              <DatePicker name="meetingDate" defaultValue={meeting.meetingDate} required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Lokasi/Media</label>
              <input autoComplete="off" name="locationOrMedia" defaultValue={meeting.locationOrMedia ?? ""} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Pemimpin Rapat</label>
              <select name="leaderUserId" defaultValue={meeting.leaderUserId} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Notulis</label>
              <select name="notetakerUserId" defaultValue={meeting.notetakerUserId ?? ""} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Agenda</label>
              <textarea autoComplete="off" name="agenda" defaultValue={meeting.agenda ?? ""} rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan Diskusi</label>
              <textarea autoComplete="off" name="discussionNotes" defaultValue={meeting.discussionNotes ?? ""} rows={4} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit
              </button>
            </div>
          </form>
        ) : (
          <dl className="text-sm space-y-2">
            <div><dt className="text-ink-muted inline">Lokasi/Media: </dt><dd className="inline text-ink">{meeting.locationOrMedia ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Notulis: </dt><dd className="inline text-ink">{userList.find((u) => u.id === meeting.notetakerUserId)?.fullName ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Agenda: </dt><dd className="inline text-ink">{meeting.agenda ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Catatan Diskusi: </dt><dd className="inline text-ink">{meeting.discussionNotes ?? "-"}</dd></div>
          </dl>
        )}
      </Card>

      <Card title="Peserta">
        {attendeeRows.length === 0 ? (
          <EmptyState message="Belum ada peserta. Peserta yang ditambahkan akan muncul di sini." />
        ) : (
          <ul className="space-y-2 text-sm mb-4">
            {attendeeRows.map((a) => {
              const emp = a.employeeId ? empList.find((e) => e.id === a.employeeId) : null;
              return (
                <li key={a.id} className="flex items-center justify-between border-b border-ink-muted/10 pb-2">
                  <span>
                    <span className="font-medium text-ink">{emp?.fullName ?? a.attendeeName}</span>
                    {a.attendeeRole && <span className="text-ink-muted"> — {a.attendeeRole}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.signed ? "sage" : "dusty-rose"}>{a.signed ? "Sudah TTD" : "Belum TTD"}</Badge>
                    {canManage && (
                      <form action={toggleAttendeeSigned}>
                        <input type="hidden" name="companySlug" value={companySlug} />
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="meetingId" value={meeting.id} />
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <input type="hidden" name="nextSigned" value={(!a.signed).toString()} />
                        <button type="submit" className="text-sage-deep hover:underline text-xs">
                          {a.signed ? "Batalkan" : "Tandai TTD"}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <form action={addAttendee} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="meetingId" value={meeting.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Karyawan (opsional)</label>
              <select name="employeeId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- tidak ada --</option>
                {empList.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama (kalau bukan karyawan)</label>
              <input autoComplete="off" name="attendeeName" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Peran (opsional)</label>
              <input autoComplete="off" name="attendeeRole" placeholder="mis. Asesor" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Tambah Peserta
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
