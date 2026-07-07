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
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Modul Aktif</h1>
        <p className="text-gray-500 text-sm mt-1">
          Aktif/nonaktifkan modul bisnis untuk {company.name}. Independen antar perusahaan.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {MODULE_KEYS.map((key) => {
          const row = rows.find((r) => r.moduleKey === key);
          const enabled = row?.isEnabled ?? false;
          return (
            <div key={key} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{MODULE_LABEL[key]}</p>
                <p className="text-xs text-gray-400">{key}</p>
              </div>
              <form action={toggleModule}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="moduleKey" value={key} />
                <input type="hidden" name="enable" value={String(!enabled)} />
                <button
                  type="submit"
                  className={`text-sm font-semibold px-4 py-2 rounded-lg transition ${
                    enabled ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {enabled ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </form>
            </div>
          );
        })}
      </section>
    </div>
  );
}
