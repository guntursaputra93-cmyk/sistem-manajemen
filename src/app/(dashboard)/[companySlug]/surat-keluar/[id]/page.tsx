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
} from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";
import { submitForApprovalAction, decideApprovalAction, markSentAction } from "../actions";

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

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
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

  const [steps, deptList, userList, attachmentRows] = await Promise.all([
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
  ]);

  const department = deptList.find((d) => d.id === letter.departmentId);
  const recipientDept = deptList.find((d) => d.id === letter.recipientDepartmentId);
  const recipientUser = userList.find((u) => u.id === letter.recipientUserId);
  const firstPendingStep = steps.find((s) => s.status === "pending");

  const canAct = hasPermission(session.user.role, "CREATE_OUTGOING_LETTER");
  const canMarkSent = hasPermission(session.user.role, "MARK_OUTGOING_LETTER_SENT");

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href={`/${companySlug}/surat-keluar`} className="text-sm text-blue-600 hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{letter.letterNumber ?? "(Draft — belum ada nomor)"}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {CATEGORY_LABEL[letter.letterCategory]} — {letter.subject}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Status</span>
          <p className="text-gray-900">{STATUS_LABEL[letter.status] ?? letter.status}</p>
        </div>
        <div>
          <span className="text-gray-500">Departemen</span>
          <p className="text-gray-900">{department?.name ?? "-"}</p>
        </div>
        <div>
          <span className="text-gray-500">Jenis</span>
          <p className="text-gray-900">{letter.jenisKey}</p>
        </div>
        <div>
          <span className="text-gray-500">Tujuan</span>
          <p className="text-gray-900">
            {letter.letterCategory === "surat_keluar" ? letter.recipient : [recipientDept?.name, recipientUser?.fullName].filter(Boolean).join(" — ")}
          </p>
        </div>
        {letter.bodyContent && (
          <div className="col-span-2">
            <span className="text-gray-500">Isi</span>
            <p className="text-gray-900 whitespace-pre-wrap">{letter.bodyContent}</p>
          </div>
        )}
      </section>

      {letter.status === "draft" && canAct && (
        <form action={submitForApprovalAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="letterId" value={letter.id} />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            Ajukan Approval
          </button>
        </form>
      )}

      {steps.length > 0 && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Jenjang Approval</h2>
          <ol className="space-y-3">
            {steps.map((step) => {
              const approver = userList.find((u) => u.id === step.approverId);
              return (
                <li key={step.id} className="text-sm border-l-2 border-blue-200 pl-3">
                  <p className="font-medium text-gray-900">
                    Jenjang {step.stepOrder}: {STEP_STATUS_LABEL[step.status]}
                    {approver ? ` — ${approver.fullName}` : ""}
                  </p>
                  {step.catatan && <p className="text-gray-600">{step.catatan}</p>}
                </li>
              );
            })}
          </ol>

          {firstPendingStep && (
            <form action={decideApprovalAction} className="mt-4 space-y-3">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="letterId" value={letter.id} />
              <input type="hidden" name="stepOrder" value={firstPendingStep.stepOrder} />
              <textarea name="catatan" placeholder="Catatan (opsional)" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="approved"
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Setujui Jenjang {firstPendingStep.stepOrder}
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="rejected"
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
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
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            Tandai Terkirim
          </button>
        </form>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Lampiran</h2>
        <AttachmentUploader entityType={letter.letterCategory} entityId={letter.id} attachments={attachmentRows} />
      </section>
    </div>
  );
}
