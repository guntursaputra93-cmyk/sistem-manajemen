import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, organizations, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createCaseAction } from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormField, inputClass } from "@/components/ui/FormField";

export default async function CreateCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { companySlug } = await params;
  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_CASES")) {
    redirect(`/${companySlug}/cases`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "case_management", companySlug }));

  const [orgList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(asc(organizations.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader breadcrumb={[{ label: "Case Management" }, { label: "Case Board", href: `/${companySlug}/cases` }, { label: "Case Baru" }]} title="Case Baru" description="Buat case baru. Tautkan opportunity/contract/penugasan dilakukan setelah case dibuat." />

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>}

      <Card title="Detail Case">
        {orgList.length === 0 ? (
          <p className="text-[13px] italic text-ink-muted">
            Belum ada organisasi/klien. Buat dulu di{" "}
            <Link href={`/${companySlug}/crm/organisasi`} className="text-sage-deep hover:underline">
              CRM → Organisasi
            </Link>
            .
          </p>
        ) : (
          <form action={createCaseAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <FormField label="Klien / Organisasi *" full>
              <select name="organizationId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  -- pilih klien --
                </option>
                {orgList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Judul Case *" full>
              <input autoComplete="off" name="title" required className={inputClass} />
            </FormField>
            <FormField label="Jenis Layanan">
              <input autoComplete="off" name="serviceType" className={inputClass} placeholder="mis. ISO 9001, SMK3" />
            </FormField>
            <FormField label="PIC">
              <select name="picUserId" className={inputClass} defaultValue="">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Target Tutup">
              <DatePicker name="targetCloseDate" />
            </FormField>
            <FormField label="Catatan" full>
              <textarea name="notes" rows={3} className={inputClass} />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit">Buat Case</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
