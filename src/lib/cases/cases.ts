import type { db as Db } from "@/lib/db";
import { cases } from "@/drizzle/schema";
import { getNextCaseSequenceNumber, formatCaseNumber } from "./numbering";

export class CaseError extends Error {}

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
