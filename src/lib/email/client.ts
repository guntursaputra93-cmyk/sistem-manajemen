import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";
import type { ReactNode } from "react";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const DEFAULT_FROM = process.env.EMAIL_FROM;

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  react?: ReactNode;
  html?: string;
  from?: string;
};

export type SendEmailResult = { success: true; id: string } | { success: false; error: string };

/**
 * Wrapper generik di atas Resend — dipakai fitur APAPUN yang butuh kirim email
 * (reset password sekarang; reminder kompetensi/kontrak, notifikasi approval
 * nanti — lihat catatan di templates/README.md). Tambah 1 fungsi kirim di sini
 * kalau butuh channel baru (SMS dst.), jangan bikin wrapper terpisah per fitur.
 *
 * SENGAJA tidak pernah throw — selalu balikin {success:false,...} + log ke
 * Sentry. Keputusan blocking (await + cek result, tampilkan error ke user)
 * vs fire-and-forget (panggil tanpa await) diserahkan ke PEMANGGIL sesuai
 * konteksnya masing-masing, bukan dipaksa 1 pola di sini (lihat spesifikasi
 * Bagian 3 & Bagian 8).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!params.react && !params.html) {
    throw new Error("sendEmail butuh salah satu dari `react` atau `html`.");
  }

  const from = params.from ?? DEFAULT_FROM;
  if (!from) {
    const message = "EMAIL_FROM belum diset di environment variables, dan tidak ada `from` yang dioper manual.";
    Sentry.captureException(new Error(message), { extra: { subject: params.subject, to: params.to } });
    return { success: false, error: message };
  }

  if (!resend) {
    const message = "RESEND_API_KEY belum diset di environment variables.";
    Sentry.captureException(new Error(message), { extra: { subject: params.subject, to: params.to } });
    return { success: false, error: message };
  }

  const payload = params.react
    ? { from, to: params.to, subject: params.subject, react: params.react }
    : { from, to: params.to, subject: params.subject, html: params.html! };

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    Sentry.captureException(new Error(`Gagal kirim email: ${error.message}`), {
      extra: { subject: params.subject, to: params.to, resendErrorName: error.name },
    });
    return { success: false, error: error.message };
  }

  return { success: true, id: data!.id };
}
