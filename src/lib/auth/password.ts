import bcrypt from "bcryptjs";

// Cost factor 12: standar industri saat ini (2^12 putaran) — cukup lambat untuk
// menyulitkan brute-force offline, tapi belum terlalu berat untuk request login normal.
// Didokumentasikan di sini karena ini nilai yang sengaja dipilih, bukan default library.
export const BCRYPT_COST_FACTOR = 12;

export function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_COST_FACTOR);
}

export function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
