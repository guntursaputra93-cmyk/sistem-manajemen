import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// SENTRY_AUTH_TOKEN belum diset — upload source map akan otomatis di-skip
// oleh plugin ini (bukan error), error tracking dasar tetap jalan tanpa itu.
export default withSentryConfig(nextConfig, {
  silent: true,
});
