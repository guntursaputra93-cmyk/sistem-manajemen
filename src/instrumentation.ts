import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const { scrubPii } = await import("@/lib/sentry/scrub");
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 1.0,
      beforeSend: scrubPii,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
