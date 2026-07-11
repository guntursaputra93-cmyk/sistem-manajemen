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
import { Card } from "@/components/ui/Card";

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
    <div className="space-y-6">
      <div>
        <Link href={`/${companySlug}/surat-keluar`} className="text-[11px] text-sage-deep hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="font-display text-[17px] font-extrabold text-ink mt-1">{letter.letterNumber ?? "(Draft — belum ada nomor)"}</h1>
        <p className="text-[11px] text-ink-muted mt-1">
          {CATEGORY_LABEL[letter.letterCategory]} — {letter.subject}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
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
            <div className="col-span-full">
              <span className="text-ink-muted">Isi</span>
              <p className="text-ink whitespace-pre-wrap">{letter.bodyContent}</p>
            </div>
          )}
        </div>
      </Card>

      {letter.status === "draft" && canAct && (
        <form action={submitForApprovalAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="letterId" value={letter.id} />
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Ajukan Approval
          </button>
        </form>
      )}

      {steps.length > 0 && (
        <Card title="Jenjang Approval">
          <TrailStepper steps={approvalStepsToTrail(steps, userList)} orientation="vertical" />

          {firstPendingStep && (
            <form action={decideApprovalAction} className="mt-4 space-y-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="letterId" value={letter.id} />
              <input type="hidden" name="stepOrder" value={firstPendingStep.stepOrder} />
              <textarea autoComplete="off" name="catatan" placeholder="Catatan (opsional)" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              <div className="flex gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="approved"
                  className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]"
                >
                  Setujui Jenjang {firstPendingStep.stepOrder}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="rejected"
                  className="bg-destructive hover:bg-destructive/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors"
                >
                  Tolak
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      {letter.status === "disetujui" && canMarkSent && (
        <form action={markSentAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="letterId" value={letter.id} />
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
            Tandai Terkirim
          </button>
        </form>
      )}

      {showProposalItems && (
        <Card title="Item Proposal">
          <div className="overflow-x-auto -mx-[18px]">
            <table className="w-full text-[11px] mb-4">
              <thead className="text-ink-muted text-[10px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-[18px] py-[7px] font-bold">Item</th>
                  <th className="text-left px-[7px] py-[7px] font-bold">Kuantitas</th>
                  <th className="text-left px-[7px] py-[7px] font-bold">Satuan</th>
                  <th className="text-left px-[7px] py-[7px] font-bold">Harga Satuan</th>
                  <th className="text-left px-[7px] py-[7px] font-bold">Subtotal</th>
                  <th className="text-left px-[7px] py-[7px] font-bold">Opportunity</th>
                  {canAct && <th className="text-left px-[7px] py-[7px] font-bold">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {itemRows.length === 0 && (
                  <tr><td colSpan={canAct ? 7 : 6} className="px-[18px] py-6 text-center text-ink-muted italic">Belum ada item.</td></tr>
                )}
                {itemRows.map((item) => {
                  const opp = oppList.find((o) => o.id === item.opportunityId);
                  return (
                    <tr key={item.id} className="border-t border-ink-muted/10 align-top">
                      <td className="px-[18px] py-[7px] text-ink">{item.itemName}</td>
                      <td className="px-[7px] py-[7px] text-ink">{item.quantity}</td>
                      <td className="px-[7px] py-[7px] text-ink">{item.unit}</td>
                      <td className="px-[7px] py-[7px] text-ink">Rp {Number(item.unitPrice).toLocaleString("id-ID")}</td>
                      <td className="px-[7px] py-[7px] text-ink">Rp {Number(item.subtotal).toLocaleString("id-ID")}</td>
                      <td className="px-[7px] py-[7px] text-ink">{opp?.title ?? "-"}</td>
                      {canAct && (
                        <td className="px-[7px] py-[7px]">
                          <details className="inline-block mr-2">
                            <summary className="text-sage-deep hover:underline text-[11px] cursor-pointer inline">Ubah</summary>
                            <form action={updateProposalItemAction} className="mt-2 space-y-2 w-64">
                              <input type="hidden" name="companySlug" value={companySlug} />
                              <input type="hidden" name="outgoingLetterId" value={letter.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <input autoComplete="off" name="itemName" defaultValue={item.itemName} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-[11px] text-ink bg-bg-base" />
                              <div className="flex gap-2">
                                <input autoComplete="off" name="quantity" type="number" step="0.01" defaultValue={item.quantity} required className="w-1/2 border border-ink-muted/20 rounded-lg px-2 py-1 text-[11px] text-ink bg-bg-base" />
                                <input autoComplete="off" name="unit" defaultValue={item.unit} required className="w-1/2 border border-ink-muted/20 rounded-lg px-2 py-1 text-[11px] text-ink bg-bg-base" />
                              </div>
                              <input autoComplete="off" name="unitPrice" type="number" step="0.01" defaultValue={item.unitPrice} required className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-[11px] text-ink bg-bg-base" />
                              <input autoComplete="off" name="notes" defaultValue={item.notes ?? ""} placeholder="Catatan" className="w-full border border-ink-muted/20 rounded-lg px-2 py-1 text-[11px] text-ink bg-bg-base" />
                              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">Edit</button>
                            </form>
                          </details>
                          <form action={deleteProposalItemAction} className="inline">
                            <input type="hidden" name="companySlug" value={companySlug} />
                            <input type="hidden" name="outgoingLetterId" value={letter.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <button type="submit" className="text-destructive hover:underline text-[11px]">Hapus</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-muted/20 font-bold">
                  <td className="px-[18px] py-[7px] text-ink" colSpan={4}>Total Nilai Proposal</td>
                  <td className="px-[7px] py-[7px] text-ink">Rp {proposalTotal.toLocaleString("id-ID")}</td>
                  <td colSpan={canAct ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>

          {canAct && (
            <form action={createProposalItemAction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="outgoingLetterId" value={letter.id} />
              <div className="col-span-full">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Item</label>
                <input autoComplete="off" name="itemName" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kuantitas</label>
                <input autoComplete="off" name="quantity" type="number" step="0.01" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Satuan</label>
                <input autoComplete="off" name="unit" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Harga Satuan (Rp)</label>
                <input autoComplete="off" name="unitPrice" type="number" step="0.01" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              {oppList.length > 0 && (
                <div className="col-span-full">
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kaitkan ke Opportunity (opsional — estimasi nilai opportunity akan otomatis diperbarui)</label>
                  <select name="opportunityId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                    <option value="">-- tidak dikaitkan --</option>
                    {oppList.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-full">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan (opsional)</label>
                <input autoComplete="off" name="notes" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="col-span-full">
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                  Tambah Item
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card title="Lampiran">
        <AttachmentUploader entityType={letter.letterCategory} entityId={letter.id} attachments={attachmentRows} />
      </Card>
    </div>
  );
}
