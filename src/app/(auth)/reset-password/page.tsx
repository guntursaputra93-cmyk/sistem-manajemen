import Link from "next/link";
import { resetPassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface rounded-xl border border-ink-muted/10 shadow-sm p-8 space-y-4 text-center">
          <h1 className="text-xl font-bold text-ink">Link Tidak Valid</h1>
          <p className="text-sm text-ink-muted">Link reset password tidak lengkap. Silakan minta link baru.</p>
          <Link href="/lupa-password" className="text-powder-blue-deep hover:underline text-sm">
            Minta Link Reset Baru
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-ink-muted/10 shadow-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink">Reset Password</h1>
          <p className="text-sm text-ink-muted mt-1">Masukkan password baru Anda.</p>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <form action={resetPassword} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Password Baru</label>
            <input
              type="password"
              name="newPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            Reset Password
          </button>
        </form>
      </div>
    </div>
  );
}
