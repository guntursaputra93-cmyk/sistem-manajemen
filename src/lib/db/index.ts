import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";

const appConnectionString = process.env.DATABASE_URL_APP;
if (!appConnectionString) {
  throw new Error("DATABASE_URL_APP belum diset di environment variables.");
}

const adminConnectionString = process.env.DATABASE_URL;
if (!adminConnectionString) {
  throw new Error("DATABASE_URL belum diset di environment variables.");
}

const appClient = postgres(appConnectionString, { prepare: false });
const adminClient = postgres(adminConnectionString, { prepare: false });

// Dipakai untuk SEMUA query aplikasi biasa (lewat role app_user, tunduk pada RLS).
export const db = drizzle(appClient, { schema });

// HANYA untuk 2 kasus pra-autentikasi yang secara inheren belum punya session/company
// context untuk dicocokkan RLS: (1) cari user by email saat proses login, (2) catat
// audit_trail untuk login/login_failed. Role di balik koneksi ini bypass RLS — jangan
// pernah dipakai untuk query data bisnis biasa di luar 2 kasus itu.
export const dbAdmin = drizzle(adminClient, { schema });

export type TenantContext = {
  role: string;
  companyId: string | null;
  // Opsional — dipakai HANYA oleh RLS row-level tambahan di tabel employees/payslips
  // (Fase 2 SDM, lihat migrasi 0036 & 0044). Semua tabel lain tidak referensi GUC ini
  // sama sekali, jadi caller lama yang tidak mengirim userId tidak terpengaruh.
  userId?: string | null;
};

/**
 * Jalankan `callback` di dalam 1 transaksi dengan session variable RLS
 * (app.current_role, app.current_company_id, app.current_user_id) di-set SET LOCAL —
 * jadi hanya berlaku untuk transaksi ini saja, tidak bocor ke koneksi lain di connection pool.
 */
export async function withTenantContext<T>(
  context: TenantContext,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_role', ${context.role}, true)`);
    await tx.execute(sql`select set_config('app.current_company_id', ${context.companyId ?? ""}, true)`);
    await tx.execute(sql`select set_config('app.current_user_id', ${context.userId ?? ""}, true)`);
    return callback(tx as unknown as typeof db);
  });
}
