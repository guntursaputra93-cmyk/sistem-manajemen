import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diset di environment variables.");
}

const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!secretKey) {
  throw new Error("SUPABASE_SECRET_KEY belum diset di environment variables.");
}

// secret key (sb_secret_...) bypass SEMUA RLS Storage — hanya boleh dipakai di kode
// server (route handler / server action), jangan pernah diimport dari komponen client.
export const supabaseAdmin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const ATTACHMENTS_BUCKET = "attachments";

let bucketEnsured = false;

// Dipanggil sekali per lifecycle proses (idempotent) — bukan di setiap upload,
// supaya tidak nambah 1 API call ekstra ke Storage tiap kali ada yang upload.
export async function ensureAttachmentsBucket(): Promise<void> {
  if (bucketEnsured) return;

  const { data: existing } = await supabaseAdmin.storage.getBucket(ATTACHMENTS_BUCKET);
  if (existing) {
    bucketEnsured = true;
    return;
  }

  const { error } = await supabaseAdmin.storage.createBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Gagal membuat bucket Storage: ${error.message}`);
  }
  bucketEnsured = true;
}
