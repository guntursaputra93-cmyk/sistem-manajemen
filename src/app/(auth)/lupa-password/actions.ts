"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db";
import { users, companies, passwordResetTokens } from "@/drizzle/schema";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  PASSWORD_RESET_REQUEST_ACTION,
  RESET_TOKEN_EXPIRY_MINUTES,
  generateResetToken,
  hashResetToken,
  recordPasswordResetRequest,
} from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email/client";
import { PasswordResetEmail } from "@/lib/email/templates/PasswordResetEmail";
import { logAudit } from "@/lib/audit/log";

const GENERIC_SUCCESS_MESSAGE = "Kalau email terdaftar, link reset password telah dikirim. Silakan cek inbox Anda.";

function resolveOrigin(host: string): string {
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  return `${isLocal ? "http" : "https"}://${host}`;
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const redirectBase = "/lupa-password";

  function redirectSuccess(): never {
    redirect(`${redirectBase}?success=${encodeURIComponent(GENERIC_SUCCESS_MESSAGE)}`);
  }

  if (!email) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Email wajib diisi.")}`);
  }

  // Rate limit SEBELUM apapun lagi — cegah spam, terlepas email terdaftar atau
  // tidak. Kalau sedang locked, tetap tampilkan pesan sukses generik yang SAMA
  // persis (bukan "terlalu banyak percobaan") — jangan bocorkan status rate
  // limit ke luar, itu sendiri bisa jadi sinyal enumeration/timing.
  const rateLimitStatus = await checkRateLimit(email, PASSWORD_RESET_REQUEST_ACTION);
  if (rateLimitStatus.locked) {
    redirectSuccess();
  }

  await recordPasswordResetRequest(email);

  // dbAdmin (bypass RLS) — belum ada session/company context sama sekali,
  // pola SAMA seperti lookup user saat login (lihat auth.ts).
  const [user] = await dbAdmin.select().from(users).where(eq(users.email, email)).limit(1);

  if (user && user.isActive) {
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60_000);

    await dbAdmin.insert(passwordResetTokens).values({ userId: user.id, token: tokenHash, expiresAt });

    const [company] = await dbAdmin.select().from(companies).where(eq(companies.id, user.companyId)).limit(1);
    const headersList = await headers();
    const origin = resolveOrigin(headersList.get("host") ?? "localhost:3000");
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;

    const emailResult = await sendEmail({
      to: user.email,
      subject: "Reset Password — Sistem Manajemen Sapta",
      react: PasswordResetEmail({
        userName: user.fullName,
        companyName: company?.name ?? "Sistem Manajemen Sapta",
        resetUrl,
        expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
      }),
    });

    // emailResult TIDAK dicek untuk mengubah alur user-facing (tetap sukses
    // generik apapun hasilnya) — kegagalan kirim sudah ter-log ke Sentry dari
    // dalam sendEmail() sendiri untuk investigasi admin, bukan tanggung jawab
    // pemanggil di sini. audit trail catat status kirimnya untuk jejak.
    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "password_reset_requested",
      metadata: { emailSent: emailResult.success },
    });
  }

  redirectSuccess();
}
