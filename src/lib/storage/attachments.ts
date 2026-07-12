import { randomUUID } from "crypto";
import type { db as Db } from "@/lib/db";
import { attachments, attachmentEntityTypeEnum } from "@/drizzle/schema";
import { supabaseAdmin, ATTACHMENTS_BUCKET, ensureAttachmentsBucket } from "./client";
import { isValidPdfMagicBytes, isValidJpgMagicBytes, isValidPngMagicBytes, MAX_ATTACHMENT_SIZE_BYTES } from "./pdf";

export type AttachmentEntityType = (typeof attachmentEntityTypeEnum.enumValues)[number];
export const ATTACHMENT_ENTITY_TYPES = attachmentEntityTypeEnum.enumValues;

export class AttachmentValidationError extends Error {}

type FileKind = "pdf" | "jpg" | "png";

const CONTENT_TYPE_BY_KIND: Record<FileKind, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
};

function detectFileKind(buffer: Buffer): FileKind | null {
  if (isValidPdfMagicBytes(buffer)) return "pdf";
  if (isValidJpgMagicBytes(buffer)) return "jpg";
  if (isValidPngMagicBytes(buffer)) return "png";
  return null;
}

// Satu-satunya entity_type yang boleh JPG/PNG selain PDF — bukti foto rapat
// kalibrasi sering berupa hasil scan/foto, bukan PDF. Entity type lain
// (surat_masuk, dokumen, dst.) TETAP PDF-only, jangan longgarkan validasinya.
const IMAGE_ALLOWED_ENTITY_TYPES: ReadonlySet<AttachmentEntityType> = new Set(["kalibrasi"]);

export type UploadAttachmentParams = {
  file: File;
  companyId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  uploadedBy: string;
};

export async function uploadAttachment(tx: typeof Db, params: UploadAttachmentParams) {
  const { file, companyId, entityType, entityId, uploadedBy } = params;

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AttachmentValidationError("Ukuran file melebihi 5MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const allowImages = IMAGE_ALLOWED_ENTITY_TYPES.has(entityType);
  const kind = detectFileKind(buffer);

  if (!kind || (kind !== "pdf" && !allowImages)) {
    throw new AttachmentValidationError(
      allowImages
        ? "File harus PDF, JPG, atau PNG yang valid (magic bytes tidak cocok)."
        : "File bukan PDF yang valid (magic bytes tidak cocok)."
    );
  }

  await ensureAttachmentsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${companyId}/${entityType}/${entityId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(objectPath, buffer, { contentType: CONTENT_TYPE_BY_KIND[kind], upsert: false });

  if (uploadError) {
    throw new Error(`Gagal upload ke Storage: ${uploadError.message}`);
  }

  const [row] = await tx
    .insert(attachments)
    .values({
      companyId,
      entityType,
      entityId,
      filePath: objectPath,
      fileName: file.name,
      fileSize: file.size,
      uploadedBy,
    })
    .returning();

  return row;
}

// Tenggat pendek (5-15 menit) sesuai spesifikasi Bagian 2.1 — default 10 menit.
export async function createSignedDownloadUrl(filePath: string, expiresInSeconds = 600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Gagal membuat signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}
