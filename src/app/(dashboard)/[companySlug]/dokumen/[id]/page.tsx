import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import {
  companies,
  documentCategories,
  documents,
  documentVersions,
  approvalSteps,
  users,
  attachments as attachmentsTable,
} from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { canViewDocument, logDocumentAccess } from "@/lib/documents/access";
import { getTeamReadStatus } from "@/lib/documents/teamReadStatus";
import { requireModuleEnabled } from "@/lib/modules";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";
import { addNewVersion, submitVersionForReviewAction, decideVersionApprovalAction } from "../actions";
import { TrailStepper, type TrailStep, type TrailStepStatus } from "@/components/ui/TrailStepper";
import { approvalStepsToTrail } from "@/lib/ui/approvalTrail";

// Urutan wajar 1 versi dari draft sampai ke status akhirnya — dipakai utk
// ringkasan "Riwayat Versi" horizontal (Bagian 3 spesifikasi desain, dipakai
// sebagai progress bar, bukan cuma daftar kronologis).
const VERSION_TRAIL_STATUS: Record<string, TrailStepStatus> = {
  draft: "upcoming",
  in_review: "pending",
  active: "pending",
  superseded: "done",
  expired: "rejected",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "Sedang Direview",
  active: "Aktif",
  superseded: "Digantikan",
  expired: "Kedaluwarsa",
};

export default async function DokumenDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_DOCUMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen", companySlug }));

  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const [doc] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(documents).where(and(eq(documents.id, id), eq(documents.companyId, company.id)))
  );
  if (!doc) notFound();

  const [category, versionList, userList, selfUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(documentCategories).where(eq(documentCategories.id, doc.categoryId))).then((r) => r[0]),
    withTenantContext(tenantContext, (tx) => tx.select().from(documentVersions).where(eq(documentVersions.documentId, doc.id)).orderBy(desc(documentVersions.versionNumber))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
  ]);

  const viewer = { role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const allowed = await withTenantContext(tenantContext, (tx) =>
    canViewDocument(tx, { companyId: company.id, documentId: doc.id, categoryId: doc.categoryId, viewer })
  );
  if (!allowed) notFound();

  const activeVersion = versionList.find((v) => v.status === "active");
  if (activeVersion) {
    await withTenantContext(tenantContext, (tx) =>
      logDocumentAccess(tx, { companyId: company.id, documentVersionId: activeVersion.id, userId: session.user.id, action: "view" })
    );
  }

  const canManage = hasPermission(session.user.role, "CREATE_DOCUMENT");
  const latestVersion = versionList[0];
  const canAddNewVersion = canManage && latestVersion && ["active", "superseded", "expired"].includes(latestVersion.status);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href={`/${companySlug}/dokumen`} className="text-sm text-blue-600 hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">{doc.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{category?.name}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      {canAddNewVersion && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Tambah Versi Baru</h2>
          <form action={addNewVersion} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="documentId" value={doc.id} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Efektif (opsional)</label>
              <input name="effectiveDate" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Berlaku Sampai (opsional)</label>
              <input name="expiresAt" type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Buat Draft Versi {latestVersion.versionNumber + 1}
              </button>
            </div>
          </form>
        </section>
      )}

      {versionList.length > 1 && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Riwayat Versi</h2>
          <TrailStepper
            orientation="horizontal"
            steps={[...versionList]
              .sort((a, b) => a.versionNumber - b.versionNumber)
              .map(
                (v): TrailStep => ({
                  id: v.id,
                  label: `Versi ${v.versionNumber}`,
                  description: STATUS_LABEL[v.status] ?? v.status,
                  status: VERSION_TRAIL_STATUS[v.status] ?? "upcoming",
                })
              )}
          />
        </section>
      )}

      {versionList.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          companySlug={companySlug}
          documentId={doc.id}
          canManage={canManage}
          userList={userList}
          tenantContext={tenantContext}
          companyId={company.id}
          teamReadAccess={hasPermission(session.user.role, "VIEW_USERS") ? { role: viewer.role, departmentId: viewer.departmentId } : null}
        />
      ))}
    </div>
  );
}

async function VersionCard({
  version,
  companySlug,
  documentId,
  canManage,
  userList,
  tenantContext,
  companyId,
  teamReadAccess,
}: {
  version: typeof documentVersions.$inferSelect;
  companySlug: string;
  documentId: string;
  canManage: boolean;
  userList: (typeof users.$inferSelect)[];
  tenantContext: { role: string; companyId: string };
  companyId: string;
  teamReadAccess: { role: Role; departmentId: string | null } | null;
}) {
  const [steps, versionAttachments] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(approvalSteps).where(and(eq(approvalSteps.entityType, "dokumen"), eq(approvalSteps.entityId, version.id))).orderBy(asc(approvalSteps.stepOrder))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(attachmentsTable).where(and(eq(attachmentsTable.entityType, "dokumen"), eq(attachmentsTable.entityId, version.id)))
    ),
  ]);

  const firstPendingStep = steps.find((s) => s.status === "pending");

  // Status baca tim (Langkah 15) — cuma utk versi aktif (yang harus benar-benar
  // dibaca), dan department_head TANPA departemen valid tidak dapat lihat apa-apa
  // (bukan malah jatuh ke tampilan seluruh perusahaan).
  const showTeamReadStatus =
    version.status === "active" &&
    teamReadAccess !== null &&
    !(teamReadAccess.role === "department_head" && !teamReadAccess.departmentId);
  const teamReadStatus = showTeamReadStatus
    ? await withTenantContext(tenantContext, (tx) =>
        getTeamReadStatus(tx, {
          documentVersionId: version.id,
          companyId,
          departmentId: teamReadAccess!.role === "department_head" ? teamReadAccess!.departmentId : null,
        })
      )
    : null;

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">
          Versi {version.versionNumber} — {STATUS_LABEL[version.status] ?? version.status}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Tanggal Efektif</span>
          <p className="text-gray-900">{version.effectiveDate ?? "-"}</p>
        </div>
        <div>
          <span className="text-gray-500">Berlaku Sampai</span>
          <p className="text-gray-900">{version.expiresAt ?? "-"}</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Lampiran</h3>
        <AttachmentUploader entityType="dokumen" entityId={version.id} attachments={versionAttachments} />
      </div>

      {version.status === "draft" && canManage && version.fileAttachmentId && (
        <form action={submitVersionForReviewAction}>
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="versionId" value={version.id} />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            Ajukan Review
          </button>
        </form>
      )}
      {version.status === "draft" && !version.fileAttachmentId && (
        <p className="text-xs text-gray-400 italic">Unggah file PDF dulu sebelum bisa diajukan review.</p>
      )}

      {steps.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Jenjang Approval</h3>
          <TrailStepper steps={approvalStepsToTrail(steps, userList)} orientation="vertical" />
          {firstPendingStep && (
            <form action={decideVersionApprovalAction} className="mt-3 space-y-2">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="documentId" value={documentId} />
              <input type="hidden" name="versionId" value={version.id} />
              <input type="hidden" name="stepOrder" value={firstPendingStep.stepOrder} />
              <textarea name="catatan" placeholder="Catatan (opsional)" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-3">
                <button type="submit" name="decision" value="approved" className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                  Setujui
                </button>
                <button type="submit" name="decision" value="rejected" className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                  Tolak
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {teamReadStatus && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Status Baca {teamReadAccess?.role === "department_head" ? "Tim" : "Perusahaan"}
          </h3>
          {teamReadStatus.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Belum ada staf di departemen ini.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {teamReadStatus.map((u) => (
                <li key={u.id} className="flex items-center justify-between">
                  <span className={u.hasRead ? "text-gray-700" : "text-red-600 font-medium"}>{u.fullName}</span>
                  <span className={u.hasRead ? "text-xs text-green-600" : "text-xs text-red-600"}>
                    {u.hasRead ? "Sudah dibaca" : "Belum dibaca"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
