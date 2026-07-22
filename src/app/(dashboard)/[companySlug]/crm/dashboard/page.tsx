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
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";

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

  const pipelineColumns: DataTableColumn<(typeof pipelineValues)[number]>[] = [
    { key: "stage", header: "Tahap", render: (s) => s.stageKey },
    { key: "count", header: "Jumlah Deal (Open)", render: (s) => s.count },
    { key: "value", header: "Total Estimasi Nilai", render: (s) => `Rp ${s.totalValue.toLocaleString("id-ID")}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "CRM" },
          { label: "Opportunity", href: `/${companySlug}/crm/opportunities` },
          { label: "Dashboard" },
        ]}
        title="Dashboard CRM"
        description={
          session.user.role === "staff" ? "Ringkasan pipeline milikmu." : session.user.role === "department_head" ? "Ringkasan pipeline departemenmu." : `Ringkasan pipeline ${company.name}.`
        }
      />

      <Card title="Pipeline Value per Tahap">
        {pipelineValues.length === 0 ? (
          <p className="text-[11px] text-ink-muted italic">Belum ada tahap pipeline dikonfigurasi.</p>
        ) : (
          <div className="space-y-3">
            <DataTable columns={pipelineColumns} rows={pipelineValues} rowKey={(s) => s.stageId} emptyMessage="Belum ada tahap pipeline dikonfigurasi." />
            <p className="text-[11px] font-bold text-ink">Total Pipeline Value: Rp {totalPipelineValue.toLocaleString("id-ID")}</p>
          </div>
        )}
      </Card>

      <Card title="Win Rate">
        {winRate.winRate === null ? (
          <p className="text-[11px] text-ink-muted italic">Belum ada deal yang closed (menang/hilang).</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-ink-muted">Menang</p>
              <p className="font-display text-2xl font-extrabold text-ink mt-1">{winRate.wonCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-ink-muted">Hilang</p>
              <p className="font-display text-2xl font-extrabold text-ink mt-1">{winRate.lostCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-ink-muted">Win Rate</p>
              <p className="font-display text-2xl font-extrabold text-ink mt-1">{(winRate.winRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        )}
      </Card>

      <Card title="Reminder Renewal / Follow-up Kontrak">
        {reminders.length === 0 ? (
          <p className="text-[11px] text-ink-muted italic">Tidak ada kontrak yang perlu dihubungi lagi dalam 60 hari ke depan.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.contractId} className="text-[11px] border-b border-ink-muted/10 pb-2 last:border-0 last:pb-0">
                <Link href={`/${companySlug}/crm/contracts/${r.contractId}`} className="text-sage-deep hover:underline font-bold">{r.organizationName}</Link>
                <span className="text-ink-muted"> — {r.opportunityTitle} — {REMINDER_REASON_LABEL[r.reason]} ({r.dueDate})</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ketersediaan Personil Bersertifikasi" className="border border-dashed border-ink-muted/20 shadow-none">
        <p className="text-[11px] text-ink-muted italic">
          Belum tersedia — bagian ini akan menampilkan lookup read-only ke data kompetensi karyawan (Fase 2) setelah modul tersebut dibangun.
        </p>
      </Card>
    </div>
  );
}
