import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { getPipelineValueByStage, getWinRate, getRenewalReminders } from "@/lib/crm/dashboard";

const REMINDER_REASON_LABEL: Record<string, string> = {
  renewal_reminder_date: "Reminder renewal",
  end_date_no_active_opportunity: "Kontrak berakhir, belum ada deal baru",
};

export default async function CrmDashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_OPPORTUNITIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const selfUser = await withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]);
  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleAssigneeIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));

  const [pipelineValues, winRate, reminders] = await Promise.all([
    withTenantContext(tenantContext, (tx) => getPipelineValueByStage(tx, { companyId: company.id, visibleAssigneeIds })),
    withTenantContext(tenantContext, (tx) => getWinRate(tx, { companyId: company.id, visibleAssigneeIds })),
    withTenantContext(tenantContext, (tx) => getRenewalReminders(tx, { companyId: company.id, visibleAssigneeIds, today: new Date() })),
  ]);

  const totalPipelineValue = pipelineValues.reduce((sum, s) => sum + s.totalValue, 0);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href={`/${companySlug}/crm/opportunities`} className="text-sm text-blue-600 hover:underline">&larr; Kembali ke CRM</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Dashboard CRM</h1>
        <p className="text-gray-500 text-sm mt-1">
          {session.user.role === "staff" ? "Ringkasan pipeline milikmu." : session.user.role === "department_head" ? "Ringkasan pipeline departemenmu." : `Ringkasan pipeline ${company.name}.`}
        </p>
      </div>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Pipeline Value per Tahap</h2>
        {pipelineValues.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Belum ada tahap pipeline dikonfigurasi.</p>
        ) : (
          <>
            <table className="w-full text-sm mb-3">
              <thead className="text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left py-1">Tahap</th>
                  <th className="text-left py-1">Jumlah Deal (Open)</th>
                  <th className="text-left py-1">Total Estimasi Nilai</th>
                </tr>
              </thead>
              <tbody>
                {pipelineValues.map((s) => (
                  <tr key={s.stageId} className="border-t border-gray-100">
                    <td className="py-2">{s.stageKey}</td>
                    <td className="py-2">{s.count}</td>
                    <td className="py-2">Rp {s.totalValue.toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm font-semibold text-gray-900">Total Pipeline Value: Rp {totalPipelineValue.toLocaleString("id-ID")}</p>
          </>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Win Rate</h2>
        {winRate.winRate === null ? (
          <p className="text-sm text-gray-400 italic">Belum ada deal yang closed (menang/hilang).</p>
        ) : (
          <div className="flex gap-8 text-sm">
            <div><span className="text-gray-500">Menang</span><p className="text-xl font-bold text-gray-900">{winRate.wonCount}</p></div>
            <div><span className="text-gray-500">Hilang</span><p className="text-xl font-bold text-gray-900">{winRate.lostCount}</p></div>
            <div><span className="text-gray-500">Win Rate</span><p className="text-xl font-bold text-gray-900">{(winRate.winRate * 100).toFixed(1)}%</p></div>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Reminder Renewal / Follow-up Kontrak</h2>
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Tidak ada kontrak yang perlu dihubungi lagi dalam 60 hari ke depan.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reminders.map((r) => (
              <li key={r.contractId} className="border-b border-gray-100 pb-2">
                <Link href={`/${companySlug}/crm/contracts/${r.contractId}`} className="text-blue-600 hover:underline font-medium">{r.organizationName}</Link>
                <span className="text-gray-500"> — {r.opportunityTitle} — {REMINDER_REASON_LABEL[r.reason]} ({r.dueDate})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border border-dashed border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Ketersediaan Personil Bersertifikasi</h2>
        <p className="text-sm text-gray-400 italic">
          Belum tersedia — bagian ini akan menampilkan lookup read-only ke data kompetensi karyawan (Fase 2) setelah modul tersebut dibangun.
        </p>
      </section>
    </div>
  );
}
