import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import {
  companies,
  departments,
  users,
  outgoingLetters,
  approvalSteps,
  attachments as attachmentsTable,
  organizations,
  opportunities,
  proposalItems,
} from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";
import { submitForApprovalAction, decideApprovalAction, markSentAction } from "../actions";
import { createProposalItemAction, updateProposalItemAction, deleteProposalItemAction } from "../../crm/proposal/actions";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";
import { approvalStepsToTrail } from "@/lib/ui/approvalTrail";

const CATEGORY_LABEL: Record<string, string> = {
  surat_keluar: "Surat Keluar",
  nota_dinas: "Nota Dinas",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

export default async function SuratKeluarDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letter] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(outgoingLetters).where(and(eq(outgoingLetters.id, id), eq(outgoingLetters.companyId, company.id)))
  );
  if (!letter) notFound();

  const crmModuleOn = await withTenantContext(tenantContext, (tx) => isModuleEnabled(tx, { companyId: company.id, moduleKey: "crm" }));
  const showProposalItems = letter.jenisKey === "penawaran" && crmModuleOn;

  const [steps, deptList, userList, attachmentRows, org, itemRows, oppList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.entityType, letter.letterCategory), eq(approvalSteps.entityId, letter.id)))
        .orderBy(asc(approvalSteps.stepOrder))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.entityType, letter.letterCategory), eq(attachmentsTable.entityId, letter.id)))
    ),
    letter.organizationId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.id, letter.organizationId!))).then((r) => r[0])
      : Promise.resolve(undefined),
    showProposalItems
      ? withTenantContext(tenantContext, (tx) => tx.select().from(proposalItems).where(eq(proposalItems.outgoingLetterId, letter.id)))
      : Promise.resolve([]),
    showProposalItems && letter.organizationId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(and(eq(opportunities.companyId, company.id), eq(opportunities.organizationId, letter.organizationId!))))
      : Promise.resolve([]),
  ]);

  const department = deptList.find((d) => d.id === letter.departmentId);
  const recipientDept = deptList.find((d) => d.id === letter.recipientDepartmentId);
  const recipientUser = userList.find((u) => u.id === letter.recipientUserId);
  const firstPendingStep = steps.find((s) => s.status === "pending");

  const canAct = hasPermission(session.user.role, "CREATE_OUTGOING_LETTER");
  const canMarkSent = hasPermission(session.user.role, "MARK_OUTGOING_LETTER_SENT");
  const proposalTotal = itemRows.reduce((sum, i) => sum + Number(i.subtotal), 0);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/${companySlug}/surat-keluar`} className="text-sm text-sage-deep hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-ink mt-2">{letter.letterNumber ?? "(Draft — belum ada nomor)"}</h1>
        <p className="text-ink-muted text-sm mt-1">
          {CATEGORY_LABEL[letter.letterCategory]} — {letter.subject}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-surface border border-ink-muted/10 rounded-xl p-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-ink-muted">Status</span>
          <p className="text-ink">{STATUS_LABEL[letter.status] ?? letter.status}</p>
        </div>
        <div>
          <span className="text-ink-muted">Departemen</span>
          <p className="text-ink">{department?.name ?? "-"}</p>
        </div>
        <div>
          <span className="text-ink-muted">Jenis</span>
          <p className="text-ink">{letter.jenisKey}</p>
        </div>
        <div>
          <span className="text-ink-muted">Tujuan</span>
          <p className="text-ink">
            {letter.letterCategory === "surat_keluar" ? letter.recipient : [recipientDept?.name, recipientUser?.fullName].filter(Boolean).join(" — ")}
          </p>
        </div>
        {org && (
          <div>
            <span className="text-ink-muted">Organisasi (CRM)</span>
            <p className="text-ink">{org.name}</p>
          </div>
        )}
        {letter.bodyContent && (
          <div className="col-span-2">
            <span className="text-ink-muted">Isi</span>
            <p className="text-ink whitespace-pre-wrap">{letter.bodyContent}</p>
          </div>
        )}
      </section>

      {letter.status === "draft" && canAct && (
        <form action={submitForApprovalAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="letterId" value={letter.id} />
          <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Ajukan Approval
          </button>
        </form>
      )}

      {steps.length > 0 && (
        <section className="bg-surface border border-ink-muted/10 rounded-xl p-6">
          <h2 className="font-semibold text-ink mb-4">Jenjang Approval</h2>
          <TrailStepper steps={approvalStepsToTrail(steps, userList)} orientation="vertical" />

          {firstPendingStep && (
            <form action={decideApprovalAction} className="mt-4 space-y-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="letterId" value={letter.id} />
              <input type="hidden" name="stepOrder" value={firstPendingStep.stepOrder} />
              <textarea name="catatan" placeholder="Catatan (opsional)" rows={2} className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              <div className="flex gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="approved"
                  className="bg-sage-deep hover:bg-sage-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Setujui Jenjang {firstPendingStep.stepOrder}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="rejected"
                  className="bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Tolak
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {letter.status === "disetujui" && canMarkSent && (
        <form action={markSentAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="letterId" value={letter.id} />
          <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Tandai Terkirim
          </button>
        </form>
      )}

      {showProposalItems && (
        <section className="bg-surface border border-ink-muted/10 rounded-xl p-6">
          <h2 className="font-semibold text-ink mb-4">Item Proposal</h2>

          <table className="w-full text-sm mb-4">
            <thead className="text-ink-muted text-xs uppercase">
              <tr>
                <th className="text-left py-1">Item</th>
                <th className="text-left py-1">Kuantitas</th>
                <th className="text-left py-1">Satuan</th>
                <th className="text-left py-1">Harga Satuan</th>
                <th className="text-left py-1">Subtotal</th>
                <th className="text-left py-1">Opportunity</th>
                {canAct && <th className="text-left py-1">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {itemRows.length === 0 && (
                <tr><td colSpan={canAct ? 7 : 6} className="py-3 text-center text-ink-muted italic">Belum ada item.</td></tr>
              )}
              {itemRows.map((item) => {
                const opp = oppList.find((o) => o.id === item.opportunityId);
                return (
                  <tr key={item.id} className="border-t border-ink-muted/10 align-top">
                    <td className="py-2">{item.itemName}</td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2">{item.unit}</td>
                    <td className="py-2">Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                    <td className="py-2">Rp {Number(item.subtotal).toLocaleString("id-ID")}</td>
                    <td className="py-2">{opp?.title ?? "-"}</td>
                    {canAct && (
                      <td className="py-2">
                        <details className="inline-block mr-2">
                          <summary className="text-sage-deep hover:underline text-xs cursor-pointer inline">Ubah</summary>
                          <form action={updateProposalItemAction} className="mt-2 space-y-2 w-64">
                            <input type="hidden" name="companySlug" value={companySlug} />
                            <input type="hidden" name="outgoingLetterId" value={letter.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <input name="itemName" defaultValue={item.itemName} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-surface" />
                            <div className="flex gap-2">
                              <input name="quantity" type="number" step="0.01" defaultValue={item.quantity} required className="w-1/2 border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-surface" />
                              <input name="unit" defaultValue={item.unit} required className="w-1/2 border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-surface" />
                            </div>
                            <input name="unitPrice" type="number" step="0.01" defaultValue={item.unitPrice} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-surface" />
                            <input name="notes" defaultValue={item.notes ?? ""} placeholder="Catatan" className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-xs text-ink bg-surface" />
                            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors">Simpan</button>
                          </form>
                        </details>
                        <form action={deleteProposalItemAction} className="inline">
                          <input type="hidden" name="companySlug" value={companySlug} />
                          <input type="hidden" name="outgoingLetterId" value={letter.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="text-destructive hover:underline text-xs">Hapus</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-muted/20 font-semibold">
                <td className="py-2" colSpan={4}>Total Nilai Proposal</td>
                <td className="py-2">Rp {proposalTotal.toLocaleString("id-ID")}</td>
                <td colSpan={canAct ? 2 : 1} />
              </tr>
            </tfoot>
          </table>

          {canAct && (
            <form action={createProposalItemAction} className="grid grid-cols-3 gap-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="outgoingLetterId" value={letter.id} />
              <div className="col-span-3">
                <label className="block text-xs font-medium text-ink-muted mb-1">Nama Item</label>
                <input name="itemName" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Kuantitas</label>
                <input name="quantity" type="number" step="0.01" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Satuan</label>
                <input name="unit" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Harga Satuan (Rp)</label>
                <input name="unitPrice" type="number" step="0.01" required className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              {oppList.length > 0 && (
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-ink-muted mb-1">Kaitkan ke Opportunity (opsional — estimasi nilai opportunity akan otomatis diperbarui)</label>
                  <select name="opportunityId" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
                    <option value="">-- tidak dikaitkan --</option>
                    {oppList.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-3">
                <label className="block text-xs font-medium text-ink-muted mb-1">Catatan (opsional)</label>
                <input name="notes" className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface" />
              </div>
              <div className="col-span-3">
                <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  Tambah Item
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bg-surface border border-ink-muted/10 rounded-xl p-6">
        <h2 className="font-semibold text-ink mb-4">Lampiran</h2>
        <AttachmentUploader entityType={letter.letterCategory} entityId={letter.id} attachments={attachmentRows} />
      </section>
    </div>
  );
}
