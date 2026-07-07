const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "utf-8");

// Cek byte asli file, BUKAN ekstensi/nama file atau Content-Type dari client —
// ketiganya gampang dipalsukan (rename .exe jadi .pdf, dsb).
export function isValidPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC_BYTES.length) return false;
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
