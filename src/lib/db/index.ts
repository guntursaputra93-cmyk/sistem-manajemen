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

// Di `next dev`, tiap recompile (HMR) meng-evaluasi ulang modul ini. Tanpa cache,
// setiap evaluasi membuat connection pool BARU sementara pool lama tidak pernah
// ditutup — koneksi menumpuk sampai Postgres menolak dengan
// "(EMAXCONN) max client connections reached". Dengan 2 client x pool default 10,
// ~10 kali reload sudah cukup menembus batas 200.
//
// Solusinya: simpan client di globalThis saat development supaya semua reload
// memakai ulang pool yang sama. Di production tidak di-cache — build produksi tidak
// pernah HMR, jadi modul hanya dievaluasi sekali per instance.
const globalForDb = globalThis as unknown as {
  __saptaAppClient?: ReturnType<typeof postgres>;
  __saptaAdminClient?: ReturnType<typeof postgres>;
};

const appClient = globalForDb.__saptaAppClient ?? postgres(appConnectionString, { prepare: false, max: 10 });
// Admin hanya dipakai 2 kasus pra-autentikasi (lihat komentar dbAdmin di bawah),
// jadi poolnya sengaja kecil.
const adminClient = globalForDb.__saptaAdminClient ?? postgres(adminConnectionString, { prepare: false, max: 5 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__saptaAppClient = appClient;
  globalForDb.__saptaAdminClient = adminClient;
}

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
