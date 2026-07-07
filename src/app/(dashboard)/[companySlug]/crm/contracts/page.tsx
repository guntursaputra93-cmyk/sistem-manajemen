import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, contracts, opportunities, organizations, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
};

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CONTRACTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [selfUser, orgList, oppList] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(eq(opportunities.companyId, company.id))),
  ]);

  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleAssigneeIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));

  const contractList = await withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(eq(contracts.companyId, company.id))).then((rows) =>
    visibleAssigneeIds
      ? rows.filter((c) => {
          const opp = oppList.find((o) => o.id === c.opportunityId);
          return opp && visibleAssigneeIds.includes(opp.assignedTo);
        })
      : rows
  );

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href={`/${companySlug}/crm/opportunities`} className="text-sm text-blue-600 hover:underline">&larr; Kembali ke CRM</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Contract (CRM)</h1>
        <p className="text-gray-500 text-sm mt-1">Dibuat otomatis saat opportunity pindah ke tahap &quot;menang&quot;.</p>
      </div>

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Organisasi</th>
              <th className="text-left px-4 py-2">Deal</th>
              <th className="text-left px-4 py-2">Nilai Kontrak</th>
              <th className="text-left px-4 py-2">Mulai</th>
              <th className="text-left px-4 py-2">Selesai</th>
              <th className="text-left px-4 py-2">Status Bayar</th>
            </tr>
          </thead>
          <tbody>
            {contractList.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 italic">Belum ada contract.</td></tr>
            )}
            {contractList.map((c) => {
              const org = orgList.find((o) => o.id === c.organizationId);
              const opp = oppList.find((o) => o.id === c.opportunityId);
              return (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">{org?.name ?? "-"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/${companySlug}/crm/contracts/${c.id}`} className="text-blue-600 hover:underline">{opp?.title ?? "-"}</Link>
                  </td>
                  <td className="px-4 py-2">Rp {Number(c.contractValue).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-2">{c.startDate}</td>
                  <td className="px-4 py-2">{c.endDate ?? "-"}</td>
                  <td className="px-4 py-2">{PAYMENT_STATUS_LABEL[c.paymentStatus] ?? c.paymentStatus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
