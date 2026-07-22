import { and, asc, count, desc, eq, max } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import {
  cases,
  caseStageHistory,
  caseServiceAssignments,
  caseMilestones,
  caseDeliverables,
  caseExternalSubmissions,
  caseExternalSubmissionHistory,
  organizations,
  users,
  opportunities,
  contracts,
  serviceAssignments,
} from "@/drizzle/schema";
import { getNextCaseSequenceNumber, formatCaseNumber } from "./numbering";
import { advanceCaseStage } from "./autoAdvanceStage";
import { PAGE_SIZE, offsetFor } from "@/lib/pagination";

export class CaseError extends Error {}

type CaseStage = (typeof cases.currentStage.enumValues)[number];
type CaseStatus = (typeof cases.status.enumValues)[number];

/** Ambil case (scoped company) atau lempar CaseError — dipakai fungsi child (1.7B). */
async function assertCase(tx: typeof Db, companyId: string, caseId: string) {
  const [c] = await tx
    .select({ id: cases.id, organizationId: cases.organizationId })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.companyId, companyId)));
  if (!c) throw new CaseError("Case tidak ditemukan.");
  return c;
}

export type CreateCaseParams = {
  companyId: string;
  organizationId: string;
  title: string;
  serviceType?: string | null;
  picUserId?: string | null;
  opportunityId?: string | null;
  contractId?: string | null;
  /** 'YYYY-MM-DD'. Kalau diisi, tahun nomor case ikut tahun ini; kalau tidak,
   *  opened_at pakai default DB (current_date) & tahun nomor = tahun server saat ini. */
  openedAt?: string | null;
  targetCloseDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

/**
 * Buat case baru sekaligus generate case_number-nya (langkah 1.4). Nomor digenerate
 * DI DALAM tx yang sama dengan insert supaya atomik — kalau insert gagal, increment
 * counter ikut rollback, jadi tidak ada nomor bolong. Pola sama seperti finance/letter
 * (generator dipanggil di dalam service, BUKAN trigger DB — konsisten keputusan proyek).
 *
 * Level service saja: TIDAK ada API route / form di sini (itu langkah 1.7/1.8).
 * Panggil dengan `tx` yang sudah punya tenant context (withTenantContext) supaya
 * tunduk RLS.
 */
export async function createCase(tx: typeof Db, params: CreateCaseParams) {
  const title = params.title.trim();
  if (!title) throw new CaseError("Judul case wajib diisi.");

  const year = params.openedAt ? Number(params.openedAt.slice(0, 4)) : new Date().getFullYear();
  const urut = await getNextCaseSequenceNumber(tx, { companyId: params.companyId, year });
  const caseNumber = formatCaseNumber(year, urut);

  const [row] = await tx
    .insert(cases)
    .values({
      companyId: params.companyId,
      caseNumber,
      organizationId: params.organizationId,
      title,
      serviceType: params.serviceType ?? null,
      picUserId: params.picUserId ?? null,
      opportunityId: params.opportunityId ?? null,
      contractId: params.contractId ?? null,
      // openedAt sengaja tidak di-set kalau null -> pakai default DB current_date.
      ...(params.openedAt ? { openedAt: params.openedAt } : {}),
      targetCloseDate: params.targetCloseDate ?? null,
      notes: params.notes ?? null,
      createdBy: params.createdBy ?? null,
    })
    .returning();

  return row;
}

export type UpdateCaseParams = {
  companyId: string;
  caseId: string;
  title: string;
  serviceType?: string | null;
  picUserId?: string | null;
  targetCloseDate?: string | null;
  notes?: string | null;
};

/**
 * Update field non-stage/non-status sebuah case (langkah 1.7). Perubahan
 * current_stage/status TIDAK di sini — pakai updateCaseStage (manual override)
 * atau advanceCaseStage (otomatis), supaya setiap transisi tahap selalu tercatat
 * di case_stage_history.
 */
export async function updateCase(tx: typeof Db, params: UpdateCaseParams) {
  const title = params.title.trim();
  if (!title) throw new CaseError("Judul case wajib diisi.");

  const [existing] = await tx.select().from(cases).where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  if (!existing) throw new CaseError("Case tidak ditemukan.");

  const [row] = await tx
    .update(cases)
    .set({
      title,
      serviceType: params.serviceType ?? null,
      picUserId: params.picUserId ?? null,
      targetCloseDate: params.targetCloseDate ?? null,
      notes: params.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, params.caseId))
    .returning();

  return row;
}

/** Ambil 1 case + data terkait dasar (organisasi & PIC). null kalau tidak ada. */
export async function getCaseById(tx: typeof Db, params: { companyId: string; caseId: string }) {
  const [row] = await tx
    .select({
      case: cases,
      organizationName: organizations.name,
      picUserName: users.fullName,
    })
    .from(cases)
    .leftJoin(organizations, eq(organizations.id, cases.organizationId))
    .leftJoin(users, eq(users.id, cases.picUserId))
    .where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  return row ?? null;
}

export type ListCasesFilters = {
  companyId: string;
  status?: string | null;
  currentStage?: string | null;
  organizationId?: string | null;
  picUserId?: string | null;
  page?: number;
};

/**
 * Daftar case ter-filter + paginasi (pola pagination existing, PAGE_SIZE=20).
 * company selalu implisit dari tenant context (RLS) + difilter eksplisit di sini.
 * Dipakai Case Board di langkah 1.8.
 */
export async function listCases(tx: typeof Db, filters: ListCasesFilters) {
  const conds = [eq(cases.companyId, filters.companyId)];
  if (filters.status) conds.push(eq(cases.status, filters.status as CaseStatus));
  if (filters.currentStage) conds.push(eq(cases.currentStage, filters.currentStage as CaseStage));
  if (filters.organizationId) conds.push(eq(cases.organizationId, filters.organizationId));
  if (filters.picUserId) conds.push(eq(cases.picUserId, filters.picUserId));
  const where = and(...conds);

  const page = filters.page && filters.page > 0 ? filters.page : 1;

  const rows = await tx
    .select({
      case: cases,
      organizationName: organizations.name,
      picUserName: users.fullName,
    })
    .from(cases)
    .leftJoin(organizations, eq(organizations.id, cases.organizationId))
    .leftJoin(users, eq(users.id, cases.picUserId))
    .where(where)
    .orderBy(desc(cases.createdAt))
    .limit(PAGE_SIZE)
    .offset(offsetFor(page));

  const [{ value: totalCount }] = await tx.select({ value: count() }).from(cases).where(where);

  return { rows, totalCount, page, pageSize: PAGE_SIZE };
}

/**
 * TRANSISI TAHAP MANUAL (override PIC) — beda dari advanceCaseStage (otomatis 1.6):
 * boleh MAJU ATAU MUNDUR, tidak dibatasi ordinal. `notes` (alasan) WAJIB, dan
 * changed_by diisi user login (bukan NULL seperti auto-advance). Menutup case
 * ('closed'/'cancelled') mengeset closed_at; pindah keluar dari tahap terminal
 * mengosongkannya lagi (case dibuka kembali).
 *
 * KOPEL stage<->status supaya tidak ada data kontradiktif (mis. stage 'closed' tapi
 * status masih 'aktif' — bikin Case Board 1.8 salah tampil): 'closed' -> status
 * 'selesai', 'cancelled' -> status 'batal'. REOPEN (override mundur dari tahap
 * terminal ke non-terminal) mengembalikan status ke 'aktif' — cegah kontradiksi
 * sebaliknya (stage terbuka tapi status masih selesai/batal). Antar tahap
 * non-terminal biasa, status TIDAK disentuh (aktif/on_hold sesuai setelan user).
 */
export async function updateCaseStage(
  tx: typeof Db,
  params: { companyId: string; caseId: string; targetStage: CaseStage; notes: string; changedBy: string }
) {
  const notes = params.notes.trim();
  if (!notes) throw new CaseError("Alasan perubahan tahap wajib diisi.");

  const [existing] = await tx.select().from(cases).where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  if (!existing) throw new CaseError("Case tidak ditemukan.");

  const now = new Date();
  const isTerminal = params.targetStage === "closed" || params.targetStage === "cancelled";
  const wasTerminalStatus = existing.status === "selesai" || existing.status === "batal";
  const statusPatch: { status?: CaseStatus } =
    params.targetStage === "closed"
      ? { status: "selesai" }
      : params.targetStage === "cancelled"
        ? { status: "batal" }
        : wasTerminalStatus
          ? { status: "aktif" } // reopen dari terminal -> kembalikan aktif
          : {};

  await tx
    .update(cases)
    .set({ currentStage: params.targetStage, closedAt: isTerminal ? now : null, ...statusPatch, updatedAt: now })
    .where(eq(cases.id, params.caseId));

  await tx.insert(caseStageHistory).values({
    companyId: params.companyId,
    caseId: params.caseId,
    fromStage: existing.currentStage,
    toStage: params.targetStage,
    notes,
    changedBy: params.changedBy,
    changedAt: now,
  });
}

/**
 * Tautkan opportunity ke case (set cases.opportunity_id) lalu auto-advance ke
 * 'penawaran' dalam tx yang sama (menyelesaikan titik integrasi 'a' yang ditunda
 * dari 1.6). Tolak kalau organisasi opportunity != organisasi case.
 */
export async function linkOpportunityToCase(tx: typeof Db, params: { companyId: string; caseId: string; opportunityId: string }) {
  const [c] = await tx.select().from(cases).where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  if (!c) throw new CaseError("Case tidak ditemukan.");
  const [opp] = await tx.select().from(opportunities).where(and(eq(opportunities.id, params.opportunityId), eq(opportunities.companyId, params.companyId)));
  if (!opp) throw new CaseError("Opportunity tidak ditemukan.");
  if (opp.organizationId !== c.organizationId) {
    throw new CaseError("Organisasi opportunity berbeda dari organisasi case — tidak bisa ditautkan.");
  }

  await tx.update(cases).set({ opportunityId: params.opportunityId, updatedAt: new Date() }).where(eq(cases.id, params.caseId));
  await advanceCaseStage(tx, params.caseId, "penawaran", "opportunity_linked");
}

/**
 * Tautkan contract ke case (set cases.contract_id) lalu auto-advance ke 'kontrak'
 * (titik integrasi 'b'). Tolak kalau organisasi contract != organisasi case.
 */
export async function linkContractToCase(tx: typeof Db, params: { companyId: string; caseId: string; contractId: string }) {
  const [c] = await tx.select().from(cases).where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  if (!c) throw new CaseError("Case tidak ditemukan.");
  const [ctr] = await tx.select().from(contracts).where(and(eq(contracts.id, params.contractId), eq(contracts.companyId, params.companyId)));
  if (!ctr) throw new CaseError("Contract tidak ditemukan.");
  if (ctr.organizationId !== c.organizationId) {
    throw new CaseError("Organisasi contract berbeda dari organisasi case — tidak bisa ditautkan.");
  }

  await tx.update(cases).set({ contractId: params.contractId, updatedAt: new Date() }).where(eq(cases.id, params.caseId));
  await advanceCaseStage(tx, params.caseId, "kontrak", "contract_linked");
}

/**
 * Tautkan service_assignment ke case (INSERT case_service_assignments, idempoten)
 * lalu auto-advance ke 'penugasan' (titik integrasi 'penugasan'). Organisasi
 * penugasan (via contract-nya) harus sama dengan organisasi case.
 */
export async function linkServiceAssignmentToCase(tx: typeof Db, params: { companyId: string; caseId: string; assignmentId: string }) {
  const [c] = await tx.select().from(cases).where(and(eq(cases.id, params.caseId), eq(cases.companyId, params.companyId)));
  if (!c) throw new CaseError("Case tidak ditemukan.");

  const [asg] = await tx
    .select({ id: serviceAssignments.id, organizationId: contracts.organizationId })
    .from(serviceAssignments)
    .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
    .where(and(eq(serviceAssignments.id, params.assignmentId), eq(serviceAssignments.companyId, params.companyId)));
  if (!asg) throw new CaseError("Penugasan tidak ditemukan.");
  if (asg.organizationId !== c.organizationId) {
    throw new CaseError("Organisasi penugasan berbeda dari organisasi case — tidak bisa ditautkan.");
  }

  const existingLink = await tx
    .select({ id: caseServiceAssignments.id })
    .from(caseServiceAssignments)
    .where(and(eq(caseServiceAssignments.caseId, params.caseId), eq(caseServiceAssignments.assignmentId, params.assignmentId)));
  if (existingLink.length === 0) {
    await tx.insert(caseServiceAssignments).values({ companyId: params.companyId, caseId: params.caseId, assignmentId: params.assignmentId });
  }

  await advanceCaseStage(tx, params.caseId, "penugasan", "assignment_linked");
}

// ============================================================================
// Langkah 1.7B — CRUD tabel pendukung (milestones / deliverables / external
// submissions). Pola 2 lapis sama seperti 1.7A. Delete = HARD delete (konvensi
// project: semua child record pakai tx.delete, tidak ada soft-delete di codebase).
// ============================================================================

// ---------- case_milestones ----------

export async function createMilestone(
  tx: typeof Db,
  params: { companyId: string; caseId: string; milestoneKey: string; title: string; stage?: CaseStage | null; dueDate?: string | null; sortOrder?: number | null }
) {
  const title = params.title.trim();
  if (!title) throw new CaseError("Judul milestone wajib diisi.");
  const milestoneKey = params.milestoneKey.trim();
  if (!milestoneKey) throw new CaseError("milestone_key wajib diisi.");
  await assertCase(tx, params.companyId, params.caseId);

  const [row] = await tx
    .insert(caseMilestones)
    .values({
      companyId: params.companyId,
      caseId: params.caseId,
      milestoneKey,
      title,
      stage: params.stage ?? null,
      dueDate: params.dueDate ?? null,
      sortOrder: params.sortOrder ?? null,
    })
    .returning();
  return row;
}

/**
 * Update generik milestone (full-field, TERMASUK status). completed_at/completed_by
 * dikelola completeMilestone; DI SINI hanya dibersihkan kalau status pindah keluar
 * dari 'done' (cegah kontradiksi: status bukan done tapi completed_at masih terisi).
 */
export async function updateMilestone(
  tx: typeof Db,
  params: { companyId: string; milestoneId: string; milestoneKey: string; title: string; stage?: CaseStage | null; status: string; dueDate?: string | null; sortOrder?: number | null; notes?: string | null }
) {
  const title = params.title.trim();
  if (!title) throw new CaseError("Judul milestone wajib diisi.");
  const milestoneKey = params.milestoneKey.trim();
  if (!milestoneKey) throw new CaseError("milestone_key wajib diisi.");
  const status = params.status.trim();
  if (!status) throw new CaseError("Status milestone wajib diisi.");

  const [existing] = await tx.select().from(caseMilestones).where(and(eq(caseMilestones.id, params.milestoneId), eq(caseMilestones.companyId, params.companyId)));
  if (!existing) throw new CaseError("Milestone tidak ditemukan.");

  const clearCompletion = status !== "done" ? { completedAt: null, completedBy: null } : {};

  const [row] = await tx
    .update(caseMilestones)
    .set({
      milestoneKey,
      title,
      stage: params.stage ?? null,
      status,
      dueDate: params.dueDate ?? null,
      sortOrder: params.sortOrder ?? null,
      notes: params.notes ?? null,
      ...clearCompletion,
    })
    .where(eq(caseMilestones.id, params.milestoneId))
    .returning();
  return row;
}

/** Shortcut centang checklist: set done + completed_at/by (aksi paling sering dipakai). */
export async function completeMilestone(tx: typeof Db, params: { companyId: string; milestoneId: string; completedBy: string }) {
  const [existing] = await tx.select().from(caseMilestones).where(and(eq(caseMilestones.id, params.milestoneId), eq(caseMilestones.companyId, params.companyId)));
  if (!existing) throw new CaseError("Milestone tidak ditemukan.");

  const [row] = await tx
    .update(caseMilestones)
    .set({ status: "done", completedAt: new Date(), completedBy: params.completedBy })
    .where(eq(caseMilestones.id, params.milestoneId))
    .returning();
  return row;
}

/** Daftar milestone sebuah case, urut sort_order (nulls last) lalu created_at. */
export async function listMilestonesByCase(tx: typeof Db, params: { companyId: string; caseId: string }) {
  return tx
    .select()
    .from(caseMilestones)
    .where(and(eq(caseMilestones.caseId, params.caseId), eq(caseMilestones.companyId, params.companyId)))
    .orderBy(asc(caseMilestones.sortOrder), asc(caseMilestones.createdAt));
}

/** HARD delete (konvensi project). */
export async function deleteMilestone(tx: typeof Db, params: { companyId: string; milestoneId: string }) {
  const [existing] = await tx.select({ id: caseMilestones.id }).from(caseMilestones).where(and(eq(caseMilestones.id, params.milestoneId), eq(caseMilestones.companyId, params.companyId)));
  if (!existing) throw new CaseError("Milestone tidak ditemukan.");
  await tx.delete(caseMilestones).where(and(eq(caseMilestones.id, params.milestoneId), eq(caseMilestones.companyId, params.companyId)));
}

// ---------- case_deliverables ----------

/** organization_id SELALU diambil dari case (bukan dari input caller). */
export async function createDeliverable(
  tx: typeof Db,
  params: { companyId: string; caseId: string; deliverableType: string; deliverableNumber?: string | null; barcodeValue?: string | null; issuedDate?: string | null; validUntil?: string | null; fileAttachmentId?: string | null }
) {
  const deliverableType = params.deliverableType.trim();
  if (!deliverableType) throw new CaseError("Jenis deliverable wajib diisi.");
  const c = await assertCase(tx, params.companyId, params.caseId);

  const [row] = await tx
    .insert(caseDeliverables)
    .values({
      companyId: params.companyId,
      caseId: params.caseId,
      organizationId: c.organizationId, // dari case, bukan input
      deliverableType,
      deliverableNumber: params.deliverableNumber?.trim() || null,
      barcodeValue: params.barcodeValue ?? null,
      issuedDate: params.issuedDate ?? null,
      validUntil: params.validUntil ?? null,
      fileAttachmentId: params.fileAttachmentId ?? null,
    })
    .returning();
  return row;
}

export async function updateDeliverable(
  tx: typeof Db,
  params: { companyId: string; deliverableId: string; deliverableType: string; deliverableNumber?: string | null; barcodeValue?: string | null; issuedDate?: string | null; validUntil?: string | null; status: string; fileAttachmentId?: string | null }
) {
  const deliverableType = params.deliverableType.trim();
  if (!deliverableType) throw new CaseError("Jenis deliverable wajib diisi.");
  const status = params.status.trim();
  if (!status) throw new CaseError("Status deliverable wajib diisi.");

  const [existing] = await tx.select().from(caseDeliverables).where(and(eq(caseDeliverables.id, params.deliverableId), eq(caseDeliverables.companyId, params.companyId)));
  if (!existing) throw new CaseError("Deliverable tidak ditemukan.");

  // organization_id sengaja TIDAK diubah — tetap terikat organisasi case.
  const [row] = await tx
    .update(caseDeliverables)
    .set({
      deliverableType,
      deliverableNumber: params.deliverableNumber?.trim() || null,
      barcodeValue: params.barcodeValue ?? null,
      issuedDate: params.issuedDate ?? null,
      validUntil: params.validUntil ?? null,
      status,
      fileAttachmentId: params.fileAttachmentId ?? null,
    })
    .where(eq(caseDeliverables.id, params.deliverableId))
    .returning();
  return row;
}

export async function listDeliverablesByCase(tx: typeof Db, params: { companyId: string; caseId: string }) {
  return tx
    .select()
    .from(caseDeliverables)
    .where(and(eq(caseDeliverables.caseId, params.caseId), eq(caseDeliverables.companyId, params.companyId)))
    .orderBy(desc(caseDeliverables.createdAt));
}

// ---------- case_external_submissions + history ----------

/** Buat pengajuan + seed 1 baris history awal (status draft) supaya timeline lengkap sejak dibuat. */
export async function createExternalSubmission(
  tx: typeof Db,
  params: { companyId: string; caseId: string; externalPartyName: string; submissionType?: string | null; trackingNumber?: string | null; createdBy?: string | null }
) {
  const externalPartyName = params.externalPartyName.trim();
  if (!externalPartyName) throw new CaseError("Nama pihak luar wajib diisi.");
  await assertCase(tx, params.companyId, params.caseId);

  const [sub] = await tx
    .insert(caseExternalSubmissions)
    .values({
      companyId: params.companyId,
      caseId: params.caseId,
      externalPartyName,
      submissionType: params.submissionType?.trim() || null,
      trackingNumber: params.trackingNumber?.trim() || null,
      createdBy: params.createdBy ?? null,
    })
    .returning();

  await tx.insert(caseExternalSubmissionHistory).values({
    companyId: params.companyId,
    submissionId: sub.id,
    status: sub.status,
    notes: null,
    reportedBy: params.createdBy ?? null,
  });

  return sub;
}

/**
 * FUNGSI UTAMA "laporan staf sampai mana prosesnya": update status pengajuan DAN
 * insert baris history — SELALU dua-duanya dalam satu transaksi, setiap dipanggil
 * (tidak ada jalur update status tanpa history). Dipanggil juga saat status sama
 * (staf melaporkan progres/keterangan pada status yang sama), supaya timeline lengkap.
 */
export async function updateSubmissionStatus(
  tx: typeof Db,
  params: { companyId: string; submissionId: string; newStatus: string; notes?: string | null; reportedBy: string }
) {
  const newStatus = params.newStatus.trim();
  if (!newStatus) throw new CaseError("Status baru wajib diisi.");

  const [existing] = await tx.select().from(caseExternalSubmissions).where(and(eq(caseExternalSubmissions.id, params.submissionId), eq(caseExternalSubmissions.companyId, params.companyId)));
  if (!existing) throw new CaseError("Pengajuan tidak ditemukan.");

  await tx.update(caseExternalSubmissions).set({ status: newStatus }).where(eq(caseExternalSubmissions.id, params.submissionId));

  await tx.insert(caseExternalSubmissionHistory).values({
    companyId: params.companyId,
    submissionId: params.submissionId,
    status: newStatus,
    notes: params.notes?.trim() || null,
    reportedBy: params.reportedBy,
  });
}

/** Daftar pengajuan sebuah case + jumlah history & waktu laporan terakhir. */
export async function listExternalSubmissionsByCase(tx: typeof Db, params: { companyId: string; caseId: string }) {
  return tx
    .select({
      submission: caseExternalSubmissions,
      historyCount: count(caseExternalSubmissionHistory.id),
      lastReportedAt: max(caseExternalSubmissionHistory.reportedAt),
    })
    .from(caseExternalSubmissions)
    .leftJoin(caseExternalSubmissionHistory, eq(caseExternalSubmissionHistory.submissionId, caseExternalSubmissions.id))
    .where(and(eq(caseExternalSubmissions.caseId, params.caseId), eq(caseExternalSubmissions.companyId, params.companyId)))
    .groupBy(caseExternalSubmissions.id)
    .orderBy(desc(caseExternalSubmissions.createdAt));
}

/** Full history sebuah pengajuan, urut waktu naik — untuk timeline. */
export async function getSubmissionHistory(tx: typeof Db, params: { companyId: string; submissionId: string }) {
  return tx
    .select()
    .from(caseExternalSubmissionHistory)
    .where(and(eq(caseExternalSubmissionHistory.submissionId, params.submissionId), eq(caseExternalSubmissionHistory.companyId, params.companyId)))
    .orderBy(asc(caseExternalSubmissionHistory.reportedAt));
}
