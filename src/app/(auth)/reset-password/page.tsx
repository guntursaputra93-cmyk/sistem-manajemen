import Link from "next/link";
import { resetPassword } from "./actions";
import { AuthShell, authInputClass, authButtonClass, authButtonGradient } from "@/components/ui/AuthShell";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <AuthShell>
        <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">Link Tidak Valid</h1>
        <p className="mb-5 mt-1.5 text-[13px] text-ink-muted">Link reset password tidak lengkap. Silakan minta link baru.</p>
        <Link href="/lupa-password" className="text-[13px] font-semibold text-peach-deep hover:underline">
          Minta Link Reset Baru
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">Reset Password</h1>
      <p className="mb-6 mt-1.5 text-[13px] text-ink-muted">Masukkan password baru Anda.</p>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-ink">{error}</p>}

      <form action={resetPassword} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-ink">
            Password Baru
          </label>
          <input
            id="new-password"
            type="password"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className={authInputClass}
          />
        </div>
        <button type="submit" className={authButtonClass} style={authButtonGradient}>
          Reset Password
        </button>
      </form>
    </AuthShell>
  );
}
