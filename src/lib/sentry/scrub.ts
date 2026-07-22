import type { ErrorEvent } from "@sentry/nextjs";

// Nama field yang dianggap PII dan wajib disamarkan sebelum dikirim ke Sentry.
// Dicocokkan case-insensitive terhadap key object (termasuk snake_case dan camelCase).
// nik/salary/gaji/payslip ditambahkan untuk Fase 2 SDM — kolom sensitif terkait
// (mis. employeeSalaryStructures.salaryAmount, payslips.payslipDetail) sengaja diberi
// nama yang mengandung salah satu token ini, bukan nama generik seperti "amount"/
// "detail", supaya tertangkap pola ini tanpa over-match ke kolom "amount" modul lain.
const SENSITIVE_KEY_PATTERN = /password|passwordhash|email|fullname|nik|salary|gaji|payslip/i;

const REDACTED = "[REDACTED]";

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value && typeof value === "object") {
    return scrubObject(value as Record<string, unknown>);
  }
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.replace(/_/g, "");
    if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
      result[key] = REDACTED;
    } else {
      result[key] = scrubValue(value);
    }
  }
  return result;
}

/**
 * Sentry's `event.request.data` datang sebagai RAW STRING JSON, bukan object
 * yang sudah di-parse — kalau langsung dijalankan scrubObject() ke situ,
 * tidak akan pernah match apapun (typeof string !== "object") dan diam-diam
 * tidak melakukan apa-apa. Harus di-parse dulu.
 */
function scrubRequestDataInPlace(event: ErrorEvent): void {
  const data = event.request?.data;
  if (data === undefined || data === null) return;

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      event.request!.data = JSON.stringify(scrubValue(parsed));
    } catch {
      // Bukan JSON valid — daripada kirim mentah tanpa diperiksa, redact semuanya.
      event.request!.data = REDACTED;
    }
    return;
  }

  event.request!.data = scrubValue(data);
}

export function scrubPii(event: ErrorEvent): ErrorEvent {
  scrubRequestDataInPlace(event);

  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      const ctx = event.contexts[key];
      if (ctx && typeof ctx === "object") {
        event.contexts[key] = scrubObject(ctx as Record<string, unknown>);
      }
    }
  }

  return event;
}
