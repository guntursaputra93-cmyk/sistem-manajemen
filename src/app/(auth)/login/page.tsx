"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthShell, authInputClass, authButtonClass, authButtonGradient } from "@/components/ui/AuthShell";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/pilih-perusahaan";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/pilih-perusahaan";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resetSuccess = searchParams.get("success");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email atau password salah.");
      return;
    }

    router.push(safeCallbackUrl(searchParams.get("callbackUrl")));
  }

  return (
    <AuthShell>
      <h1 className="font-display text-[22px] font-extrabold tracking-tight text-ink">Selamat datang kembali</h1>
      <p className="mb-6 mt-1.5 text-[13px] text-ink-muted">Masuk ke Sistem Manajemen Sapta</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-ink">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@perusahaan.co.id"
            className={authInputClass}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-xs font-semibold text-ink">
              Password
            </label>
            <Link href="/lupa-password" className="text-xs font-semibold text-peach-deep hover:underline">
              Lupa password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${authInputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-muted hover:text-ink cursor-pointer"
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {resetSuccess && <p className="rounded-lg bg-success/15 px-3 py-2 text-[13px] text-ink">{resetSuccess}</p>}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-ink">{error}</p>}

        <button type="submit" disabled={loading} className={authButtonClass} style={authButtonGradient}>
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
