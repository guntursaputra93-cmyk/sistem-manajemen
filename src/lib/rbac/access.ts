export type SessionLike = {
  role: string;
  companySlug: string;
};

// super_admin boleh lihat perusahaan MANAPUN lewat [companySlug] di URL —
// itu justru mekanisme "pemilihan company" untuk role ini. Role lain hanya
// boleh mengakses slug milik company mereka sendiri, dicocokkan langsung dari
// JWT (companySlug disimpan saat login, lihat src/auth.ts) — tidak perlu query
// DB tambahan di proxy untuk kasus umum ini.
export function canAccessCompanySlug(session: SessionLike, urlCompanySlug: string): boolean {
  if (session.role === "super_admin") return true;
  return session.companySlug === urlCompanySlug;
}

export function canAccessPilihPerusahaan(session: SessionLike): boolean {
  return session.role === "super_admin";
}
