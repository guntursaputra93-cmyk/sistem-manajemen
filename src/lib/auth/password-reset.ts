import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { rateLimits } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";

export const PASSWORD_RESET_REQUEST_ACTION = "password_reset_request";
// Ambang batas beda dari login (lihat lib/auth/rate-limit.ts, 5x/15menit) —
// ini bukan brute-force password, tapi cegah spam kirim email. Lebih longgar
// jumlahnya (3x) tapi lockout lebih lama (1 jam, menyamai umur token itu sendiri).
export const MAX_RESET_REQUESTS = 3;
export const RESET_REQUEST_LOCKOUT_MINUTES = 60;
export const RESET_TOKEN_EXPIRY_MINUTES = 60;

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

// SHA-256 (bukan bcrypt seperti password) — token random 32-byte sudah setara
// ratusan bit entropi, tidak butuh slow-hash yang didesain melawan brute-force
// password rendah-entropi pilihan manusia. Prinsipnya sama (jangan simpan
// nilai mentah), algoritmanya sengaja beda karena ancamannya beda.
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * SELALU increment tiap kali diminta — terlepas dari apakah email-nya
 * terdaftar, supaya email yang TIDAK terdaftar pun tidak bisa dipakai spam
 * request berulang (kalau cuma di-skip untuk email tak dikenal, itu sendiri
 * jadi celah timing/enumeration). Pola identik recordLoginFailure, ambang
 * batas beda — lihat konstanta di atas.
 */
export async function recordPasswordResetRequest(identifier: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, PASSWORD_RESET_REQUEST_ACTION)))
    .limit(1);

  const now = new Date();

  if (!existing) {
    await db.insert(rateLimits).values({
      identifier,
      actionType: PASSWORD_RESET_REQUEST_ACTION,
      attemptCount: 1,
      windowStart: now,
      lockedUntil: null,
    });
    return;
  }

  const previousLockExpired = existing.lockedUntil ? existing.lockedUntil.getTime() <= now.getTime() : false;
  const nextCount = previousLockExpired ? 1 : existing.attemptCount + 1;
  const shouldLock = nextCount >= MAX_RESET_REQUESTS;

  await db
    .update(rateLimits)
    .set({
      attemptCount: shouldLock ? 0 : nextCount,
      windowStart: previousLockExpired ? now : existing.windowStart,
      lockedUntil: shouldLock ? new Date(now.getTime() + RESET_REQUEST_LOCKOUT_MINUTES * 60_000) : existing.lockedUntil,
    })
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.actionType, PASSWORD_RESET_REQUEST_ACTION)));
}
