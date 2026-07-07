import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations, organizationContacts, opportunities, activities, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { updateOrganization, createContact, createActivity } from "../actions";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  telepon: "Telepon",
  meeting: "Meeting",
  email: "Email",
  lainnya: "Lainnya",
};

export default async function OrganisasiDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_ORGANIZATIONS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [org] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(organizations).where(and(eq(organizations.id, id), eq(organizations.companyId, company.id)))
  );
  if (!org) notFound();

  const [contacts, oppList, selfUser, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(organizationContacts).where(eq(organizationContacts.organizationId, org.id)).orderBy(asc(organizationContacts.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(eq(opportunities.organizationId, org.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
  ]);

  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleCreatorIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));

  const activityList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(activities).where(eq(activities.organizationId, org.id)).orderBy(desc(activities.activityDate))
  ).then((rows) => (visibleCreatorIds ? rows.filter((a) => visibleCreatorIds.includes(a.createdBy)) : rows));

  const canManage = hasPermission(session.user.role, "MANAGE_ORGANIZATIONS");
  const canLogActivity = hasPermission(session.user.role, "CREATE_ACTIVITY");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href={`/${companySlug}/crm/organisasi`} className="text-sm text-blue-600 hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{org.name}</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Detail Organisasi</h2>
        {canManage ? (
          <form action={updateOrganization} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Organisasi</label>
              <input name="name" defaultValue={org.name} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Industri</label>
              <input name="industry" defaultValue={org.industry ?? ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ukuran Perusahaan</label>
              <input name="companySize" defaultValue={org.companySize ?? ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Asal Akuisisi</label>
              <input name="source" defaultValue={org.source ?? ""} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
              <textarea name="notes" defaultValue={org.notes ?? ""} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Simpan
              </button>
            </div>
          </form>
        ) : (
          <dl className="text-sm space-y-2">
            <div><dt className="text-gray-500 inline">Industri: </dt><dd className="inline">{org.industry ?? "-"}</dd></div>
            <div><dt className="text-gray-500 inline">Ukuran: </dt><dd className="inline">{org.companySize ?? "-"}</dd></div>
            <div><dt className="text-gray-500 inline">Asal: </dt><dd className="inline">{org.source ?? "-"}</dd></div>
            <div><dt className="text-gray-500 inline">Catatan: </dt><dd className="inline">{org.notes ?? "-"}</dd></div>
          </dl>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Kontak</h2>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400 italic mb-4">Belum ada kontak.</p>
        ) : (
          <ul className="space-y-2 text-sm mb-4">
            {contacts.map((c) => (
              <li key={c.id} className="border-b border-gray-100 pb-2">
                <span className="font-medium">{c.name}</span>
                {c.isPrimary && <span className="ml-2 text-xs text-green-600">(Utama)</span>}
                {c.position && <span className="text-gray-500"> — {c.position}</span>}
                <div className="text-gray-500">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form action={createContact} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nama Kontak</label>
              <input name="name" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jabatan</label>
              <input name="position" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input name="email" type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telepon</label>
              <input name="phone" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" name="isPrimary" value="true" id="isPrimary" className="h-4 w-4" />
              <label htmlFor="isPrimary" className="text-sm text-gray-700">Kontak utama</label>
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Tambah Kontak
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Aktivitas / Follow-up</h2>
        {activityList.length === 0 ? (
          <p className="text-sm text-gray-400 italic mb-4">Belum ada aktivitas tercatat.</p>
        ) : (
          <ul className="space-y-2 text-sm mb-4">
            {activityList.map((a) => {
              const creator = userList.find((u) => u.id === a.createdBy);
              const opp = oppList.find((o) => o.id === a.opportunityId);
              return (
                <li key={a.id} className="border-b border-gray-100 pb-2">
                  <span className="font-medium">{ACTIVITY_TYPE_LABEL[a.activityType]}</span>
                  <span className="text-gray-500"> — {a.activityDate}{opp ? ` — ${opp.title}` : ""}{creator ? ` — oleh ${creator.fullName}` : ""}</span>
                  {a.notes && <div className="text-gray-700">{a.notes}</div>}
                  {a.nextFollowupDate && <div className="text-gray-500 text-xs">Follow-up berikutnya: {a.nextFollowupDate}</div>}
                </li>
              );
            })}
          </ul>
        )}

        {canLogActivity && (
          <form action={createActivity} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jenis</label>
              <select name="activityType" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="telepon">Telepon</option>
                <option value="meeting">Meeting</option>
                <option value="email">Email</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal</label>
              <input name="activityDate" type="date" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {oppList.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Kaitkan ke Opportunity (opsional)</label>
                <select name="opportunityId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- tidak dikaitkan --</option>
                  {oppList.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Catatan</label>
              <textarea name="notes" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Follow-up Berikutnya (opsional)</label>
              <input name="nextFollowupDate" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Catat Aktivitas
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
