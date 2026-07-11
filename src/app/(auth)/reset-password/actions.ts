"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db";
import { users, passwordResetTokens } from "@/drizzle/schema";
import { hashResetToken } from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit/log";

export async function resetPassword(formData: FormData): Promise<void> {
  const token = formData.get("token")?.toString() ?? "";
  const newPassword = formData.get("newPassword")?.toString() ?? "";

  function errorRedirect(message: string): never {
    const params = new URLSearchParams({ error: message });
    if (token) params.set("token", token);
    redirect(`/reset-password?${params.toString()}`);
  }

  if (!token || !newPassword) {
    errorRedirect("Token dan password baru wajib diisi.");
  }
  if (newPassword.length < 8) {
    errorRedirect("Password minimal 8 karakter.");
  }

  const tokenHash = hashResetToken(token);

  // dbAdmin (bypass RLS) — password_reset_tokens memang didesain deny-all
  // untuk app_user, satu-satunya jalur akses yang sah adalah lewat sini
  // (lihat migrasi 0054 & komentar di drizzle/schema/passwordResetTokens.ts).
  const [tokenRow] = await dbAdmin
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, tokenHash), isNull(passwordResetTokens.usedAt)))
    .limit(1);

  // Token tidak ketemu ATAU sudah kedaluwarsa -> arahkan minta link baru
  // (bukan tampilkan form ini lagi, token yang ini sudah mati).
  if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) {
    redirect(`/lupa-password?error=${encodeURIComponent("Link reset tidak valid atau sudah kedaluwarsa. Silakan minta link baru.")}`);
  }

  const [user] = await dbAdmin.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  if (!user) {
    redirect(`/lupa-password?error=${encodeURIComponent("Akun tidak ditemukan. Silakan minta link baru.")}`);
  }

  const newPasswordHash = await hashPassword(newPassword);

  await dbAdmin.update(users).set({ passwordHash: newPasswordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
  // Tandai used_at SETELAH password berhasil diganti — token sekali pakai,
  // tidak bisa dipakai ulang meski belum expiresAt.
  await dbAdmin.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenRow.id));

  await logAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "password_reset_completed",
  });

  redirect(`/login?success=${encodeURIComponent("Password berhasil direset. Silakan masuk dengan password baru Anda.")}`);
}
