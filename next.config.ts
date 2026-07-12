import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Hostname diambil dari NEXT_PUBLIC_SUPABASE_URL (bukan di-hardcode) supaya
// config ini tetap benar kalau project Supabase beda per environment.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/company-logos/**",
          },
        ]
      : [],
  },
};

// SENTRY_AUTH_TOKEN belum diset — upload source map akan otomatis di-skip
// oleh plugin ini (bukan error), error tracking dasar tetap jalan tanpa itu.
export default withSentryConfig(nextConfig, {
  silent: true,
});
