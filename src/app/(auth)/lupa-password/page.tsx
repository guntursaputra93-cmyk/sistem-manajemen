import Link from "next/link";
import { requestPasswordReset } from "./actions";

export default async function LupaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-ink-muted/10 shadow-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink">Lupa Password</h1>
          <p className="text-sm text-ink-muted mt-1">Masukkan email Anda, kami kirim link reset password.</p>
        </div>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        {success && <p className="text-sm text-sage-deep text-center">{success}</p>}

        {!success && (
          <form action={requestPasswordReset} className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Email</label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              Kirim Link Reset
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="text-powder-blue-deep hover:underline">← Kembali ke halaman masuk</Link>
        </p>
      </div>
    </div>
  );
}
