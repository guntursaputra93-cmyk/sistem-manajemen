import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, contracts, opportunities, organizations, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { updateContractAction } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
};

const PAYMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  belum_dibayar: "dusty-rose",
  sebagian: "powder-blue",
  lunas: "sage",
};

export default async function ContractDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_CONTRACTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [contract] = await withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(and(eq(contracts.id, id), eq(contracts.companyId, company.id))));
  if (!contract) notFound();

  const [opp, org, selfUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(eq(opportunities.id, contract.opportunityId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.id, contract.organizationId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
  ]);

  const viewer = { userId: session.user.id, role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibleAssigneeIds = await withTenantContext(tenantContext, (tx) => getVisibleAssigneeIds(tx, { companyId: company.id, viewer }));
  if (visibleAssigneeIds && (!opp || !visibleAssigneeIds.includes(opp.assignedTo))) {
    redirect(`/${companySlug}/crm/contracts?error=${encodeURIComponent("Tidak punya izin melihat contract ini.")}`);
  }

  const canManage = hasPermission(session.user.role, "MANAGE_CONTRACTS");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/${companySlug}/crm/contracts`} className="text-sm text-sage-deep hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="font-display text-2xl font-bold text-ink mt-2">{opp?.title ?? "Contract"}</h1>
        <p className="text-sm text-ink-muted mt-1">{org?.name}</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Detail Contract">
        {canManage ? (
          <form action={updateContractAction} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="contractId" value={contract.id} />
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Nilai Kontrak (Rp)</label>
              <input
                name="contractValue"
                type="number"
                step="0.01"
                defaultValue={contract.contractValue}
                required
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Status Pembayaran</label>
              <select
                name="paymentStatus"
                defaultValue={contract.paymentStatus}
                required
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              >
                <option value="belum_dibayar">Belum Dibayar</option>
                <option value="sebagian">Sebagian</option>
                <option value="lunas">Lunas</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal Mulai</label>
              <DatePicker name="startDate" defaultValue={contract.startDate} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal Selesai</label>
              <DatePicker name="endDate" defaultValue={contract.endDate} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal Reminder Renewal (opsional)</label>
              <DatePicker name="renewalReminderDate" defaultValue={contract.renewalReminderDate} />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Simpan
              </button>
            </div>
          </form>
        ) : (
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-ink-muted inline">Nilai Kontrak: </dt>
              <dd className="inline text-ink">Rp {Number(contract.contractValue).toLocaleString("id-ID")}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Status Pembayaran: </dt>
              <dd className="inline">
                <Badge variant={PAYMENT_STATUS_VARIANT[contract.paymentStatus] ?? "powder-blue"}>{PAYMENT_STATUS_LABEL[contract.paymentStatus]}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Mulai: </dt>
              <dd className="inline text-ink">{contract.startDate}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Selesai: </dt>
              <dd className="inline text-ink">{contract.endDate ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted inline">Reminder Renewal: </dt>
              <dd className="inline text-ink">{contract.renewalReminderDate ?? "-"}</dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
