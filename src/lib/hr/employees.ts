import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { employees, positionHistory, users } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";

export class EmployeeError extends Error {}

export type EmployeeViewer = {
  userId: string;
  role: Role;
  departmentId: string | null;
};

/**
 * staff cuma lihat baris employees miliknya sendiri; department_head lihat semua
 * karyawan di departemennya; company_admin/super_admin lihat semua — ditegakkan
 * di sini SEBAGAI TAMBAHAN dari RLS row-level di tabel employees (lihat migrasi
 * 0036), bukan pengganti. Pola persis getVisibleAssigneeIds di lib/crm/opportunities.ts.
 * Dipakai ulang oleh sub-modul SDM lain (cuti, absensi, kompetensi) untuk filter
 * app-level karena tabel-tabel itu TIDAK punya RLS row-level sendiri.
 */
export async function getVisibleEmployeeIds(tx: typeof Db, params: { companyId: string; viewer: EmployeeViewer }): Promise<string[] | null> {
  if (params.viewer.role === "company_admin" || params.viewer.role === "super_admin") return null; // null = tanpa filter

  if (params.viewer.role === "department_head" && params.viewer.departmentId) {
    const deptEmployees = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, params.companyId), eq(employees.departmentId, params.viewer.departmentId)));
    return deptEmployees.map((e) => e.id);
  }

  const [self] = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, params.companyId), eq(employees.userId, params.viewer.userId)));
  return self ? [self.id] : [];
}

/**
 * Tutup baris position_history 'active' lama (kalau ada) dan buka baris baru —
 * atomik karena dijalankan dalam 1 transaksi (`tx` yang sama dari withTenantContext).
 * Menyinkronkan employees.departmentId/currentPositionTitle (denormalized) supaya
 * listing tidak perlu join ke position_history tiap saat. Pola persis
 * activateDocumentVersion di lib/documents/versions.ts.
 */
export async function changeEmployeePosition(
  tx: typeof Db,
  params: {
    companyId: string;
    employeeId: string;
    positionTitle: string;
    departmentId: string | null;
    jobLevel: string | null;
    changeType: "awal" | "promosi" | "demosi" | "mutasi";
    notes: string | null;
    effectiveDate: string;
    changedBy: string;
  }
): Promise<{ id: string }> {
  await tx
    .update(positionHistory)
    .set({ status: "superseded", endDate: params.effectiveDate })
    .where(and(eq(positionHistory.employeeId, params.employeeId), eq(positionHistory.status, "active")));

  const [row] = await tx
    .insert(positionHistory)
    .values({
      companyId: params.companyId,
      employeeId: params.employeeId,
      positionTitle: params.positionTitle,
      departmentId: params.departmentId,
      jobLevel: params.jobLevel,
      changeType: params.changeType,
      notes: params.notes,
      status: "active",
      effectiveDate: params.effectiveDate,
      endDate: null,
      createdBy: params.changedBy,
    })
    .returning();

  await tx
    .update(employees)
    .set({ departmentId: params.departmentId, currentPositionTitle: params.positionTitle, updatedAt: new Date() })
    .where(eq(employees.id, params.employeeId));

  return { id: row.id };
}

/** Dipakai halaman detail karyawan untuk resolve viewer (departmentId dari users, bukan employees). */
export async function resolveViewer(tx: typeof Db, params: { userId: string; role: Role }): Promise<EmployeeViewer> {
  const [selfUser] = await tx.select().from(users).where(eq(users.id, params.userId));
  return { userId: params.userId, role: params.role, departmentId: selfUser?.departmentId ?? null };
}

/**
 * Cari baris employees milik user yang sedang login (kalau ada) — dipakai halaman
 * cuti/absensi self-service untuk resolve employeeId dari session.user.id. Bisa
 * null: tidak semua user (mis. admin murni tanpa jadi karyawan) punya baris employees.
 */
export async function getEmployeeByUserId(tx: typeof Db, params: { companyId: string; userId: string }) {
  const [self] = await tx
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, params.companyId), eq(employees.userId, params.userId)));
  return self ?? null;
}
