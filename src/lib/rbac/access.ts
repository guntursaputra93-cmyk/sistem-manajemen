export type SessionLike = {
  role: string;
  companySlug: string;
};

// Segmen pertama URL non-company yang bisa ketangkap regex [companySlug] di
// proxy.ts (mis. "/dashboard" tanpa slug) — wajib ditolak DULU, sebelum bypass
// role super_admin, supaya tidak dianggap slug perusahaan valid dan lolos
// tanpa redirect (root cause bug 404: super_admin login tanpa callbackUrl).
const RESERVED_SLUGS = ["dashboard", "api", "pilih-perusahaan", "favicon.ico"];

// super_admin boleh lihat perusahaan MANAPUN lewat [companySlug] di URL —
// itu justru mekanisme "pemilihan company" untuk role ini. Role lain hanya
// boleh mengakses slug milik company mereka sendiri, dicocokkan langsung dari
// JWT (companySlug disimpan saat login, lihat src/auth.ts) — tidak perlu query
// DB tambahan di proxy untuk kasus umum ini.
export function canAccessCompanySlug(session: SessionLike, urlCompanySlug: string): boolean {
  if (RESERVED_SLUGS.includes(urlCompanySlug)) return false;
  if (session.role === "super_admin") return true;
  return session.companySlug === urlCompanySlug;
}

export function canAccessPilihPerusahaan(session: SessionLike): boolean {
  return session.role === "super_admin";
}
