import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, companyModules } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { MODULE_KEYS, MODULE_LABEL } from "@/lib/modules";
import { toggleModule } from "./actions";

export default async function ModulePage({
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

  if (!hasPermission(session.user.role, "MANAGE_MODULES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const rows = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companyModules).where(eq(companyModules.companyId, company.id))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Modul Aktif</h1>
        <p className="text-sm text-ink-muted mt-1">Aktif/nonaktifkan modul bisnis untuk {company.name}. Independen antar perusahaan.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <div className="bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        {MODULE_KEYS.map((key) => {
          const row = rows.find((r) => r.moduleKey === key);
          const enabled = row?.isEnabled ?? false;
          return (
            <div key={key} className="flex items-center justify-between px-6 py-4 border-b border-ink-muted/10 last:border-0">
              <div>
                <p className="text-sm font-medium text-ink">{MODULE_LABEL[key]}</p>
                <p className="text-xs text-ink-muted">{key}</p>
              </div>
              <form action={toggleModule}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="moduleKey" value={key} />
                <input type="hidden" name="enable" value={String(!enabled)} />
                <button
                  type="submit"
                  className={`transition-colors rounded-lg ${
                    enabled
                      ? "text-sm font-semibold px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] bg-sage-deep text-white hover:bg-sage-deep/90 shadow-[0_3px_10px_rgba(74,103,65,0.3)]"
                  }`}
                >
                  {enabled ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
