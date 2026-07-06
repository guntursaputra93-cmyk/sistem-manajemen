"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">Terjadi kesalahan</h1>
          <p className="text-sm text-gray-500 mt-1">Tim kami sudah diberi tahu. Silakan coba lagi nanti.</p>
        </div>
      </body>
    </html>
  );
}
