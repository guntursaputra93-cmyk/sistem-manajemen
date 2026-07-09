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

  // --- SDM / Data Karyawan ---
  // VIEW_EMPLOYEES dibuka utk semua role tapi dibatasi ke diri sendiri/departemen via
  // getVisibleEmployeeIds (app-level) + RLS row-level (DB-level, lihat migrasi 0036).
  VIEW_EMPLOYEES: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_EMPLOYEES: ["super_admin", "company_admin"],
  MANAGE_POSITION_HISTORY: ["super_admin", "company_admin"],

  // --- SDM / Cuti & Absensi ---
  MANAGE_LEAVE_TYPES: ["super_admin", "company_admin"],
  VIEW_LEAVE_BALANCES: ["super_admin", "company_admin", "department_head", "staff"],
  VIEW_LEAVE_REQUESTS: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_LEAVE_REQUEST: ["super_admin", "company_admin", "department_head", "staff"],
  APPROVE_LEAVE_REQUEST: ["super_admin", "company_admin", "department_head"],
  // Absensi diisi manual oleh admin/department_head, bukan self check-in (keputusan Fase 2).
  VIEW_ATTENDANCE: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_ATTENDANCE: ["super_admin", "company_admin", "department_head"],

  // --- SDM / Kompetensi ---
  MANAGE_COMPETENCY_TYPES: ["super_admin", "company_admin"],
  VIEW_EMPLOYEE_COMPETENCIES: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_EMPLOYEE_COMPETENCIES: ["super_admin", "company_admin"],

  // --- SDM / CPD (logbook pengembangan profesional, SOP Pemeliharaan Kompetensi Auditor) ---
  VIEW_CPD_ACTIVITIES: ["super_admin", "company_admin", "department_head", "staff"], // staff: milik sendiri (getVisibleEmployeeIds)
  CREATE_CPD_ACTIVITY: ["super_admin", "company_admin", "department_head", "staff"], // staff: milik sendiri
  MANAGE_CPD_SETTINGS: ["super_admin", "company_admin"],

  // --- SDM / Kalibrasi (notulen rapat kalibrasi tim, SOP Pemeliharaan Kompetensi Auditor) ---
  // Sengaja TIDAK termasuk staff — notulen berisi diskusi kinerja, bukan self-service.
  VIEW_CALIBRATION_MEETINGS: ["super_admin", "company_admin", "department_head"],
  MANAGE_CALIBRATION_MEETINGS: ["super_admin", "company_admin", "department_head"],

  // --- SDM / Payroll ---
  MANAGE_SALARY_COMPONENTS: ["super_admin", "company_admin"],
  MANAGE_EMPLOYEE_SALARY_STRUCTURE: ["super_admin", "company_admin"],
  RUN_PAYROLL: ["super_admin", "company_admin"],
  VIEW_PAYROLL_RUNS: ["super_admin", "company_admin"],
  // department_head HANYA lihat payslip miliknya sendiri (RLS payslips tidak punya
  // cabang department_head sama sekali, beda dari RLS employees — lihat migrasi 0044).
  VIEW_PAYSLIPS: ["super_admin", "company_admin", "department_head", "staff"],
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
