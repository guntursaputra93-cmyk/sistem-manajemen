import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, cases, organizations, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { updateCaseAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormField, inputClass } from "@/components/ui/FormField";

export default async function EditCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`/${companySlug}/cases/${id}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "case_management", companySlug }));

  const [kase] = await withTenantContext(tenantContext, (tx) => tx.select().from(cases).where(and(eq(cases.id, id), eq(cases.companyId, company.id))));
  if (!kase) notFound();

  const [org, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.id, kase.organizationId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={[
          { label: "Case Management" },
          { label: "Case Board", href: `/${companySlug}/cases` },
          { label: kase.caseNumber ?? "Case", href: `/${companySlug}/cases/${kase.id}` },
          { label: "Edit" },
        ]}
        title={`Edit: ${kase.title}`}
        description="Organisasi/klien tidak bisa diubah setelah case dibuat."
      />

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>}

      <Card title="Detail Case">
        {/* Full-field update: SEMUA field editable dikirim (pre-fill nilai sekarang) supaya
            field yang tidak diubah user tidak ikut ter-null-kan (lihat updateCase 1.7A). */}
        <form action={updateCaseAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="caseId" value={kase.id} />
          <FormField label="Klien / Organisasi" full>
            <input value={org?.name ?? "-"} disabled className={`${inputClass} opacity-60`} />
          </FormField>
          <FormField label="Judul Case *" full>
            <input autoComplete="off" name="title" required defaultValue={kase.title} className={inputClass} />
          </FormField>
          <FormField label="Jenis Layanan">
            <input autoComplete="off" name="serviceType" defaultValue={kase.serviceType ?? ""} className={inputClass} />
          </FormField>
          <FormField label="PIC">
            <select name="picUserId" defaultValue={kase.picUserId ?? ""} className={inputClass}>
              <option value="">-- tidak ada --</option>
              {userList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Target Tutup">
            <DatePicker name="targetCloseDate" defaultValue={kase.targetCloseDate} yearRange="future" />
          </FormField>
          <FormField label="Catatan" full>
            <textarea name="notes" rows={3} defaultValue={kase.notes ?? ""} className={inputClass} />
          </FormField>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit">Simpan Perubahan</Button>
            <Link href={`/${companySlug}/cases/${kase.id}`} className="text-[13px] font-semibold text-ink-muted hover:text-ink hover:underline">
              Batal
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
