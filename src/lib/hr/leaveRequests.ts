import { and, eq, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { leaveBalances, leaveTypes, leaveRequests } from "@/drizzle/schema";

export class LeaveRequestError extends Error {}

/**
 * Idempoten: kalau baris leave_balances untuk employee+leave_type+year belum ada,
 * dibuat otomatis dari leave_types.defaultQuotaPerYear. `remaining` adalah kolom
 * generated (lihat drizzle/migrations/0038) — tidak pernah ditulis manual di sini.
 */
export async function getOrCreateLeaveBalance(
  tx: typeof Db,
  params: { companyId: string; employeeId: string; leaveTypeId: string; year: number }
): Promise<{ id: string; quota: number; used: number; remaining: number | null }> {
  const [existing] = await tx
    .select()
    .from(leaveBalances)
    .where(
      and(
        eq(leaveBalances.employeeId, params.employeeId),
        eq(leaveBalances.leaveTypeId, params.leaveTypeId),
        eq(leaveBalances.year, params.year)
      )
    );
  if (existing) return existing;

  const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, params.leaveTypeId));
  if (!leaveType) throw new LeaveRequestError("Jenis cuti tidak ditemukan.");

  const [created] = await tx
    .insert(leaveBalances)
    .values({
      companyId: params.companyId,
      employeeId: params.employeeId,
      leaveTypeId: params.leaveTypeId,
      year: params.year,
      quota: leaveType.defaultQuotaPerYear,
      used: 0,
    })
    .returning();
  return created;
}

/**
 * Approve + increment saldo cuti atomik dalam 1 transaksi (tx yang sama dari
 * withTenantContext). Guard konkurensi: UPDATE ... WHERE status='pending' ambil row
 * lock — approve ganda serentak akan diblokir sampai yang pertama commit, lalu yang
 * kedua lihat status sudah bukan 'pending' dan gagal (bukan increment dobel).
 * Cek kuota dilakukan SETELAH status di-flip tapi SEBELUM increment used — kalau
 * kurang, throw di sini me-rollback SELURUH transaksi (termasuk flip status yang
 * baru saja terjadi), jadi pengajuan tetap 'pending', bukan ke-approve tanpa saldo.
 */
export async function approveLeaveRequestAndIncrementBalance(
  tx: typeof Db,
  params: { companyId: string; leaveRequestId: string; approverId: string; catatan?: string | null }
): Promise<void> {
  const [request] = await tx
    .update(leaveRequests)
    .set({ status: "approved", approverId: params.approverId, decidedAt: new Date(), catatan: params.catatan ?? null })
    .where(and(eq(leaveRequests.id, params.leaveRequestId), eq(leaveRequests.companyId, params.companyId), eq(leaveRequests.status, "pending")))
    .returning();

  if (!request) throw new LeaveRequestError("Pengajuan ini sudah diproses sebelumnya.");

  const year = new Date(request.startDate).getFullYear();
  const balance = await getOrCreateLeaveBalance(tx, {
    companyId: params.companyId,
    employeeId: request.employeeId,
    leaveTypeId: request.leaveTypeId,
    year,
  });

  if ((balance.remaining ?? 0) < request.totalDays) {
    throw new LeaveRequestError("Sisa kuota cuti tidak mencukupi.");
  }

  await tx
    .update(leaveBalances)
    .set({ used: sql`${leaveBalances.used} + ${request.totalDays}`, updatedAt: new Date() })
    .where(eq(leaveBalances.id, balance.id));
}

export async function rejectLeaveRequest(
  tx: typeof Db,
  params: { companyId: string; leaveRequestId: string; approverId: string; catatan?: string | null }
): Promise<void> {
  const [request] = await tx
    .update(leaveRequests)
    .set({ status: "rejected", approverId: params.approverId, decidedAt: new Date(), catatan: params.catatan ?? null })
    .where(and(eq(leaveRequests.id, params.leaveRequestId), eq(leaveRequests.companyId, params.companyId), eq(leaveRequests.status, "pending")))
    .returning();

  if (!request) throw new LeaveRequestError("Pengajuan ini sudah diproses sebelumnya.");
}
