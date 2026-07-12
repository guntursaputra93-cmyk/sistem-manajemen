import { randomUUID } from "crypto";
import { supabaseAdmin, COMPANY_LOGOS_BUCKET, ensureCompanyLogosBucket } from "./client";
import { isValidJpgMagicBytes, isValidPngMagicBytes } from "./pdf";

export class CompanyLogoValidationError extends Error {}

export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

export async function uploadCompanyLogo(params: { file: File; companyId: string }): Promise<string> {
  const { file, companyId } = params;

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    throw new CompanyLogoValidationError("Ukuran logo melebihi 2MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPng = isValidPngMagicBytes(buffer);
  const isJpg = !isPng && isValidJpgMagicBytes(buffer);
  if (!isPng && !isJpg) {
    throw new CompanyLogoValidationError("File harus PNG atau JPG yang valid (magic bytes tidak cocok).");
  }

  await ensureCompanyLogosBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${companyId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(COMPANY_LOGOS_BUCKET)
    .upload(objectPath, buffer, { contentType: isPng ? "image/png" : "image/jpeg", upsert: false });

  if (uploadError) {
    throw new Error(`Gagal upload logo ke Storage: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin.storage.from(COMPANY_LOGOS_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}
