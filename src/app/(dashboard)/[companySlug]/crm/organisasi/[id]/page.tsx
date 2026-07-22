import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations, organizationContacts, opportunities, activities, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { updateOrganization, createContact, createActivity } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "CRM" },
          { label: "Organisasi / Klien", href: `/${companySlug}/crm/organisasi` },
          { label: org.name },
        ]}
        title={org.name}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Detail Organisasi">
        {canManage ? (
          <form action={updateOrganization} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Organisasi</label>
              <input autoComplete="new-password"
                name="name"
                defaultValue={org.name}
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tipe Rekanan</label>
              <select
                name="partnerType"
                defaultValue={org.partnerType}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              >
                <option value="klien">Klien (pelanggan)</option>
                <option value="pemasok">Pemasok / Vendor</option>
                <option value="keduanya">Keduanya</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Industri</label>
              <input autoComplete="off"
                name="industry"
                defaultValue={org.industry ?? ""}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ukuran Perusahaan</label>
              <input autoComplete="off"
                name="companySize"
                defaultValue={org.companySize ?? ""}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Asal Akuisisi</label>
              <input autoComplete="off"
                name="source"
                defaultValue={org.source ?? ""}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan</label>
              <textarea autoComplete="off"
                name="notes"
                defaultValue={org.notes ?? ""}
                rows={2}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit
              </button>
            </div>
          </form>
        ) : (
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-ink-muted inline">Industri: </dt>
              <dd className="inline text-ink">{org.industry ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Ukuran: </dt>
              <dd className="inline text-ink">{org.companySize ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Asal: </dt>
              <dd className="inline text-ink">{org.source ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Catatan: </dt>
              <dd className="inline text-ink">{org.notes ?? "-"}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title="Kontak">
        {contacts.length === 0 ? (
          <EmptyState message="Belum ada kontak. Kontak yang ditambahkan akan muncul di sini." />
        ) : (
          <ul className="space-y-2 text-sm mb-4">
            {contacts.map((c) => (
              <li key={c.id} className="border-b border-ink-muted/10 pb-2">
                <span className="font-medium text-ink">{c.name}</span>
                {c.isPrimary && (
                  <span className="ml-2">
                    <Badge variant="sage">Utama</Badge>
                  </span>
                )}
                {c.position && <span className="text-ink-muted"> — {c.position}</span>}
                <div className="text-ink-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form action={createContact} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Kontak</label>
              <input autoComplete="new-password"
                name="name"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jabatan</label>
              <input autoComplete="off"
                name="position"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Email</label>
              <input autoComplete="new-password"
                name="email"
                type="email"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Telepon</label>
              <input autoComplete="off"
                name="phone"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <input type="checkbox" name="isPrimary" value="true" id="isPrimary" className="h-4 w-4 accent-sage-deep" />
              <label htmlFor="isPrimary" className="text-sm text-ink-muted">
                Kontak utama
              </label>
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Tambah Kontak
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Aktivitas / Follow-up">
        {activityList.length === 0 ? (
          <EmptyState message="Belum ada aktivitas tercatat. Aktivitas yang dicatat akan muncul di sini." />
        ) : (
          <ul className="space-y-2 text-sm mb-4">
            {activityList.map((a) => {
              const creator = userList.find((u) => u.id === a.createdBy);
              const opp = oppList.find((o) => o.id === a.opportunityId);
              return (
                <li key={a.id} className="border-b border-ink-muted/10 pb-2">
                  <span className="font-medium text-ink">{ACTIVITY_TYPE_LABEL[a.activityType]}</span>
                  <span className="text-ink-muted">
                    {" "}
                    — {a.activityDate}
                    {opp ? ` — ${opp.title}` : ""}
                    {creator ? ` — oleh ${creator.fullName}` : ""}
                  </span>
                  {a.notes && <div className="text-ink">{a.notes}</div>}
                  {a.nextFollowupDate && <div className="text-ink-muted text-xs">Follow-up berikutnya: {a.nextFollowupDate}</div>}
                </li>
              );
            })}
          </ul>
        )}

        {canLogActivity && (
          <form action={createActivity} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="organizationId" value={org.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis</label>
              <select
                name="activityType"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              >
                <option value="telepon">Telepon</option>
                <option value="meeting">Meeting</option>
                <option value="email">Email</option>
                <option value="lainnya">Lainnya</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal</label>
              <DatePicker name="activityDate" required />
            </div>
            {oppList.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kaitkan ke Opportunity (opsional)</label>
                <select
                  name="opportunityId"
                  className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
                >
                  <option value="">-- tidak dikaitkan --</option>
                  {oppList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan</label>
              <textarea autoComplete="off"
                name="notes"
                rows={2}
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Follow-up Berikutnya (opsional)</label>
              <DatePicker name="nextFollowupDate" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Catat Aktivitas
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
