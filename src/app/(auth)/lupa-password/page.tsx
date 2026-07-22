import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { AuthShell, authInputClass, authButtonClass, authButtonGradient } from "@/components/ui/AuthShell";

export default async function LupaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <AuthShell>
      <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">Lupa Password</h1>
      <p className="mb-6 mt-1.5 text-[13px] text-ink-muted">Masukkan email Anda, kami kirim link reset password.</p>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-ink">{error}</p>}
      {success && <p className="mb-4 rounded-lg bg-success/15 px-3 py-2 text-[13px] text-ink">{success}</p>}

      {!success && (
        <form action={requestPasswordReset} className="space-y-4">
          <div>
            <label htmlFor="lupa-email" className="mb-1.5 block text-xs font-semibold text-ink">
              Email
            </label>
            <input
              id="lupa-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="nama@perusahaan.co.id"
              className={authInputClass}
            />
          </div>
          <button type="submit" className={authButtonClass} style={authButtonGradient}>
            Kirim Link Reset
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-[13px]">
        <Link href="/login" className="font-semibold text-peach-deep hover:underline">
          ← Kembali ke halaman masuk
        </Link>
      </p>
    </AuthShell>
  );
}
