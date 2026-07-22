import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, approvalFlows, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addApprovalStep, deleteApprovalStep } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
      <PageHeader
        breadcrumb={[{ label: "Pengaturan" }, { label: "Jenjang Approval" }]}
        title="Jenjang Approval"
        description="Atur urutan approval per jenis. Tiap jenis boleh punya jumlah jenjang berbeda."
        actions={
          <FormDrawer buttonLabel="Tambah Jenjang" title="Tambah Jenjang Approval" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={addApprovalStep}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <FormSection title="① Berlaku Untuk">
                <FormField label="Berlaku untuk *">
                  <select name="appliesTo" className={inputClass} required>
                    <option value="surat_keluar">Surat Keluar</option>
                    <option value="nota_dinas">Nota Dinas</option>
                    <option value="dokumen">Dokumen</option>
                  </select>
                </FormField>
                <FormField label="Jenis" hint="bebas, mis. internal">
                  <input autoComplete="off" name="jenisKey" required className={inputClass} />
                </FormField>
                <FormField label="Urutan Jenjang *">
                  <input autoComplete="off" name="stepOrder" type="number" min={1} defaultValue={1} required className={inputClass} />
                </FormField>
              </FormSection>
              <FormSection title="② Siapa yang Menyetujui">
                <FormField
                  label=""
                  full
                >
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-ink mb-1.5">
                    <input type="radio" name="approverMode" value="role" defaultChecked className="accent-peach-deep" /> Berdasarkan Role
                  </label>
                  <select name="requiredRole" className={inputClass}>
                    <option value="department_head">Kepala Departemen (departemen pengirim)</option>
                    <option value="company_admin">Admin Perusahaan</option>
                    <option value="staff">Staff</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </FormField>
                <FormField label="" full>
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-ink mb-1.5">
                    <input type="radio" name="approverMode" value="user" className="accent-peach-deep" /> Orang Spesifik
                  </label>
                  <select name="requiredApproverUserId" className={inputClass}>
                    <option value="">-- pilih orang --</option>
                    {userRows.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role})
                      </option>
                    ))}
                  </select>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Jenjang" />
            </form>
          </FormDrawer>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Perubahan berhasil disimpan.</div>}

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
