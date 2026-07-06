export type Role = "super_admin" | "company_admin" | "department_head" | "staff";

// Matrix permission eksplisit — bukan if-else tersebar di kode. Fase 0 baru
// mencakup kemampuan administratif inti (belum ada modul bisnis, itu fase
// berikutnya); tambahkan permission baru di sini saat modul baru dibangun.
export const PERMISSIONS = {
  MANAGE_COMPANIES: ["super_admin"],
  VIEW_COMPANY: ["super_admin", "company_admin", "department_head", "staff"],

  MANAGE_DEPARTMENTS: ["super_admin", "company_admin"],
  VIEW_DEPARTMENTS: ["super_admin", "company_admin", "department_head", "staff"],

  MANAGE_USERS: ["super_admin", "company_admin"],
  VIEW_USERS: ["super_admin", "company_admin", "department_head"],

  MANAGE_MODULES: ["super_admin"],

  VIEW_AUDIT_TRAIL: ["super_admin", "company_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[];
  return allowedRoles.includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  company_admin: "Admin Perusahaan",
  department_head: "Kepala Departemen",
  staff: "Staff",
};
