const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "utf-8");
const JPG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hasMagicBytes(buffer: Buffer, magic: Buffer): boolean {
  if (buffer.length < magic.length) return false;
  return buffer.subarray(0, magic.length).equals(magic);
}

// Cek byte asli file, BUKAN ekstensi/nama file atau Content-Type dari client —
// ketiganya gampang dipalsukan (rename .exe jadi .pdf, dsb).
export function isValidPdfMagicBytes(buffer: Buffer): boolean {
  return hasMagicBytes(buffer, PDF_MAGIC_BYTES);
}

export function isValidJpgMagicBytes(buffer: Buffer): boolean {
  return hasMagicBytes(buffer, JPG_MAGIC_BYTES);
}

export function isValidPngMagicBytes(buffer: Buffer): boolean {
  return hasMagicBytes(buffer, PNG_MAGIC_BYTES);
}

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
