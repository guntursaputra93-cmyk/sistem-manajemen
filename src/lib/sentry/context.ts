import * as Sentry from "@sentry/nextjs";

/**
 * Dipanggil dari callback `session()` di src/auth.ts — BUKAN dari proxy.ts.
 * proxy.ts (edge/node boundary terpisah) dan route handler jalan sebagai
 * eksekusi yang berbeda; Sentry.setUser() di proxy.ts tidak akan ikut
 * terbawa ke scope route handler downstream. Callback `session()` dipanggil
 * setiap kali `auth()` dieksekusi — dan `auth()` itu sendiri dipanggil oleh
 * proxy.ts DAN oleh setiap route/page yang butuh session — jadi memasang
 * context di sini otomatis mencakup kedua sisi tanpa perlu diulang manual
 * di tiap route.
 */
export function setSentryUserContext(user: { id: string; role: string; companyId: string } | null): void {
  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag("companyId", undefined);
    Sentry.setTag("role", undefined);
    return;
  }

  Sentry.setUser({ id: user.id });
  Sentry.setTag("companyId", user.companyId);
  Sentry.setTag("role", user.role);
}
