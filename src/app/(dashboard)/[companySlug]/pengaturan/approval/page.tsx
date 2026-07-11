import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, approvalFlows, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addApprovalStep, deleteApprovalStep } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const APPLIES_TO_LABEL: Record<string, string> = {
  surat_keluar: "Surat Keluar",
  nota_dinas: "Nota Dinas",
  dokumen: "Dokumen",
};

export default async function ApprovalFlowsPage({
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

  if (!hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [flowRows, userRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ flow: approvalFlows, approverName: users.fullName })
        .from(approvalFlows)
        .leftJoin(users, eq(approvalFlows.requiredApproverUserId, users.id))
        .where(eq(approvalFlows.companyId, company.id))
        .orderBy(asc(approvalFlows.appliesTo), asc(approvalFlows.jenisKey), asc(approvalFlows.stepOrder))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
  ]);

  const grouped = new Map<string, typeof flowRows>();
  for (const row of flowRows) {
    const key = `${row.flow.appliesTo}::${row.flow.jenisKey}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Jenjang Approval</h1>
        <p className="text-sm text-ink-muted mt-1">Atur urutan approval per jenis. Tiap jenis boleh punya jumlah jenjang berbeda.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Perubahan berhasil disimpan.</div>}

      <Card title="Tambah Jenjang">
        <form action={addApprovalStep} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Berlaku untuk</label>
            <select
              name="appliesTo"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              required
            >
              <option value="surat_keluar">Surat Keluar</option>
              <option value="nota_dinas">Nota Dinas</option>
              <option value="dokumen">Dokumen</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis (bebas, mis. internal)</label>
            <input autoComplete="off"
              name="jenisKey"
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Urutan Jenjang</label>
            <input autoComplete="off"
              name="stepOrder"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            />
          </div>
          <div className="hidden lg:block" />
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1">
              <input type="radio" name="approverMode" value="role" defaultChecked className="accent-sage-deep" /> Berdasarkan Role
            </label>
            <select
              name="requiredRole"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="department_head">Kepala Departemen (departemen pengirim)</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="staff">Staff</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1">
              <input type="radio" name="approverMode" value="user" className="accent-sage-deep" /> Orang Spesifik
            </label>
            <select
              name="requiredApproverUserId"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
            >
              <option value="">-- pilih orang --</option>
              {userRows.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-full">
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Tambah Jenjang
            </button>
          </div>
        </form>
      </Card>

      <section className="space-y-4">
        {grouped.size === 0 && <EmptyState message="Belum ada konfigurasi approval sama sekali." />}
        {[...grouped.entries()].map(([key, rows]) => {
          const [appliesTo, jenisKey] = key.split("::");
          return (
            <Card
              key={key}
              title={APPLIES_TO_LABEL[appliesTo]}
              description={jenisKey}
            >
              <ol className="space-y-2">
                {rows.map(({ flow, approverName }) => (
                  <li key={flow.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">
                      Jenjang {flow.stepOrder}:{" "}
                      {flow.requiredApproverUserId
                        ? `Orang spesifik — ${approverName ?? "?"}`
                        : ROLE_LABEL[flow.requiredRole as keyof typeof ROLE_LABEL] ?? flow.requiredRole}
                    </span>
                    <form action={deleteApprovalStep}>
                      <input type="hidden" name="companySlug" value={companySlug} />
                      <input type="hidden" name="id" value={flow.id} />
                      <button type="submit" className="text-destructive hover:underline text-xs">
                        Hapus
                      </button>
                    </form>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
