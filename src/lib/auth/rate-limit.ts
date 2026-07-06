import { db } from "@/lib/db";
import { rateLimits } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";

// Nilai dari spesifikasi Bagian 4.2: 5x gagal berturut-turut -> kunci 15 menit.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

// rate_limits tidak punya dimensi company_id (lihat schema rateLimits.ts) dan
// RLS-nya sengaja permisif untuk app_user, jadi query di sini pakai `db` biasa,
// bukan dbAdmin — tidak perlu bypass RLS untuk tabel yang memang tidak
// bertingkat per-tenant.

export type RateLimitStatus = {
  locked: boolean;
  lockedUntil: Date | null;
};

export async function checkRateLimit(identifier: string, actionType: string): Promise<RateLimitStatus> {
  const [row] = await db
    .select()
    .from(rateLimits)
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, actionType)))
    .limit(1);

  if (!row || !row.lockedUntil) {
    return { locked: false, lockedUntil: null };
  }

  const locked = row.lockedUntil.getTime() > Date.now();
  return { locked, lockedUntil: locked ? row.lockedUntil : null };
}

export async function recordLoginFailure(identifier: string, actionType: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, actionType)))
    .limit(1);

  const now = new Date();

  if (!existing) {
    await db.insert(rateLimits).values({
      identifier,
      actionType,
      attemptCount: 1,
      windowStart: now,
      lockedUntil: null,
    });
    return;
  }

  // Kalau lockout sebelumnya sudah lewat, mulai hitungan baru dari 1 lagi.
  const previousLockExpired = existing.lockedUntil ? existing.lockedUntil.getTime() <= now.getTime() : false;
  const nextCount = previousLockExpired ? 1 : existing.attemptCount + 1;
  const shouldLock = nextCount >= MAX_FAILED_ATTEMPTS;

  await db
    .update(rateLimits)
    .set({
      attemptCount: shouldLock ? 0 : nextCount,
      windowStart: previousLockExpired ? now : existing.windowStart,
      lockedUntil: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : existing.lockedUntil,
    })
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, actionType)));
}

export async function recordLoginSuccess(identifier: string, actionType: string): Promise<void> {
  await db
    .update(rateLimits)
    .set({ attemptCount: 0, lockedUntil: null, windowStart: new Date() })
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, actionType)));
}
