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

  MANAGE_APPROVAL_FLOWS: ["super_admin", "company_admin"],

  VIEW_INCOMING_LETTERS: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_INCOMING_LETTER: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_DISPOSITION: ["super_admin", "company_admin", "department_head"],

  VIEW_OUTGOING_LETTERS: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_OUTGOING_LETTER: ["super_admin", "company_admin", "department_head", "staff"],
  MARK_OUTGOING_LETTER_SENT: ["super_admin", "company_admin", "department_head"],

  MANAGE_DOCUMENT_CATEGORIES: ["super_admin", "company_admin"],
  VIEW_DOCUMENTS: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_DOCUMENT: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_DOCUMENT_ACCESS_RULES: ["super_admin", "company_admin"],

  VIEW_DASHBOARD_MONITORING: ["super_admin", "company_admin"],
  MANAGE_DASHBOARD_SETTINGS: ["super_admin", "company_admin"],

  VIEW_ORGANIZATIONS: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_ORGANIZATIONS: ["super_admin", "company_admin", "department_head", "staff"],

  MANAGE_PIPELINE_STAGES: ["super_admin", "company_admin"],

  VIEW_OPPORTUNITIES: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_OPPORTUNITY: ["super_admin", "company_admin", "department_head", "staff"],
  REASSIGN_OPPORTUNITY: ["super_admin", "company_admin", "department_head"],

  // contract dibuat otomatis (lihat lib/crm/contracts.ts) — hanya company_admin/super_admin
  // yang boleh mengedit nilai/tanggal/status pembayarannya (spesifikasi CRM Bagian 4).
  VIEW_CONTRACTS: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_CONTRACTS: ["super_admin", "company_admin"],

  VIEW_ACTIVITIES: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_ACTIVITY: ["super_admin", "company_admin", "department_head", "staff"],

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
