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
// Logo perusahaan BUKAN data sensitif (beda dari lampiran surat/CPD/dst di
// bucket ATTACHMENTS_BUCKET) — bucket public supaya URL-nya bisa langsung
// dipakai di <img src> sidebar tanpa signed URL/expiry.
export const COMPANY_LOGOS_BUCKET = "company-logos";

let attachmentsBucketEnsured = false;
let companyLogosBucketEnsured = false;

async function ensureBucket(
  bucket: string,
  options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }
): Promise<void> {
  const { data: existing } = await supabaseAdmin.storage.getBucket(bucket);
  if (existing) return;

  const { error } = await supabaseAdmin.storage.createBucket(bucket, options);
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Gagal membuat bucket Storage: ${error.message}`);
  }
}

// Dipanggil sekali per lifecycle proses (idempotent) — bukan di setiap upload,
// supaya tidak nambah 1 API call ekstra ke Storage tiap kali ada yang upload.
export async function ensureAttachmentsBucket(): Promise<void> {
  if (attachmentsBucketEnsured) return;
  await ensureBucket(ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"],
  });
  attachmentsBucketEnsured = true;
}

export async function ensureCompanyLogosBucket(): Promise<void> {
  if (companyLogosBucketEnsured) return;
  await ensureBucket(COMPANY_LOGOS_BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg"],
  });
  companyLogosBucketEnsured = true;
}
