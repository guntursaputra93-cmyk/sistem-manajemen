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

  // --- Fase 4 / Penjadwalan Layanan (module_key terpisah dari sdm_*) ---
  // staff: hanya penugasan miliknya sendiri (getVisibleEmployeeIds, pola sama dgn
  // VIEW_EMPLOYEES/VIEW_CPD_ACTIVITIES). department_head boleh menjadwalkan tim-nya
  // sendiri (pola sama dgn APPROVE_LEAVE_REQUEST/MANAGE_ATTENDANCE) — staff TIDAK
  // menjadwalkan diri sendiri, penugasan selalu dibuat admin/kepala departemen.
  VIEW_SERVICE_ASSIGNMENTS: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_SERVICE_ASSIGNMENTS: ["super_admin", "company_admin", "department_head"],

  // --- Fase 4 / Witnessed Audit Evaluation (FR-03) ---
  // Sengaja TIDAK termasuk staff, pola persis VIEW/MANAGE_CALIBRATION_MEETINGS —
  // penilaian kinerja personil, bukan self-service. staff tetap bisa LIHAT
  // evaluasi tentang dirinya lewat scoping getVisibleEmployeeIds di halaman
  // (assignment miliknya sendiri), tapi tidak bisa membuat/menandatangani sendiri.
  VIEW_WITNESSED_AUDIT_EVALUATIONS: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_WITNESSED_AUDIT_EVALUATIONS: ["super_admin", "company_admin", "department_head"],

  // --- Fase 4 / Performance Evaluation (FR-04) ---
  // Pola sama persis dgn WITNESSED_AUDIT_EVALUATIONS (lihat komentar di atas) —
  // evaluasi kinerja top-down oleh Ketua Tim/Technical Manager, staff cuma lihat.
  VIEW_PERFORMANCE_EVALUATIONS: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_PERFORMANCE_EVALUATIONS: ["super_admin", "company_admin", "department_head"],

  // --- Fase 3 / Keuangan ---
  // Modul ini setara sensitif dengan payroll (spesifikasi Fase 3 Bagian 0) — SENGAJA
  // tidak ada department_head/staff sama sekali di permission manapun, beda dari
  // modul lain yang biasanya punya varian VIEW_* lebih longgar. Pola persis
  // MANAGE_SALARY_COMPONENTS (admin-only, tidak ada VIEW_SALARY_COMPONENTS terpisah).
  VIEW_CHART_OF_ACCOUNTS: ["super_admin", "company_admin"],
  MANAGE_CHART_OF_ACCOUNTS: ["super_admin", "company_admin"],

  // Jurnal umum (Langkah 2) — 1 permission MANAGE mencakup draft/edit/tambah-baris/
  // posting/void/koreksi sekaligus (tidak dipecah propose-vs-approve seperti
  // approval_flows) karena role model saat ini cuma super_admin/company_admin yang
  // boleh masuk modul Keuangan sama sekali — pola sama seperti RUN_PAYROLL (1
  // permission tunggal untuk seluruh alur run payroll, bukan dipisah generate/finalize).
  VIEW_JOURNAL_ENTRIES: ["super_admin", "company_admin"],
  MANAGE_JOURNAL_ENTRIES: ["super_admin", "company_admin"],

  // Laporan (Langkah 3: Buku Besar/Neraca/Laba Rugi) — read-only, tidak ada MANAGE
  // (laporan diagregat dari jurnal, tidak pernah diedit langsung). Permission
  // terpisah dari VIEW_JOURNAL_ENTRIES supaya kalau nanti role lain butuh lihat
  // laporan tanpa akses ke detail jurnal per baris, tinggal ubah daftar role di sini.
  VIEW_FINANCIAL_REPORTS: ["super_admin", "company_admin"],

  // AR Invoice & Payment (Langkah 4) — pola sama persis dgn VIEW/MANAGE_JOURNAL_ENTRIES:
  // 1 permission MANAGE mencakup create/posting invoice DAN mencatat payment sekaligus
  // (tidak dipecah propose-vs-approve), karena role model modul Keuangan masih
  // admin-only sepenuhnya.
  VIEW_AR_INVOICES: ["super_admin", "company_admin"],
  MANAGE_AR_INVOICES: ["super_admin", "company_admin"],

  // AP Tagihan & Pembayaran (Item 5c) — cerminan AR: 1 permission MANAGE mencakup
  // buat/posting tagihan DAN mencatat pembayaran.
  VIEW_AP_BILLS: ["super_admin", "company_admin"],
  MANAGE_AP_BILLS: ["super_admin", "company_admin"],

  // HPP Proyek & Margin (Langkah 5) — pola sama persis dgn VIEW/MANAGE_AR_INVOICES.
  // Laporan margin proyek dianggap read-only (turunan dari hpp_project_costs +
  // ar_invoices + contracts), jadi cukup gate dengan VIEW_HPP_PROJECT_COSTS yang sama,
  // tidak perlu permission report terpisah seperti VIEW_FINANCIAL_REPORTS.
  VIEW_HPP_PROJECT_COSTS: ["super_admin", "company_admin"],
  MANAGE_HPP_PROJECT_COSTS: ["super_admin", "company_admin"],

  // RKAP Budget & Realisasi (Langkah 6) — pola sama persis dgn VIEW/MANAGE_HPP_PROJECT_COSTS.
  // Laporan realisasi vs anggaran dianggap read-only (turunan dari rkap_budgets +
  // journal_entry_lines), cukup gate dengan VIEW_RKAP_BUDGETS yang sama.
  VIEW_RKAP_BUDGETS: ["super_admin", "company_admin"],
  MANAGE_RKAP_BUDGETS: ["super_admin", "company_admin"],

  // Aset Tetap & Penyusutan (Langkah 7) — pola sama persis dgn VIEW/MANAGE_RKAP_BUDGETS.
  VIEW_FIXED_ASSETS: ["super_admin", "company_admin"],
  MANAGE_FIXED_ASSETS: ["super_admin", "company_admin"],

  // Kasbon (Langkah 8) — BEDA dari semua permission Keuangan lain: staff/department_head
  // ikut termasuk di VIEW/CREATE (pola sama persis VIEW_LEAVE_REQUESTS/CREATE_LEAVE_REQUEST)
  // karena kasbon adalah pengajuan self-service karyawan, bukan laporan keuangan.
  // Visibilitas "hanya milik sendiri" utk staff/department_head ditegakkan lewat RLS
  // row-level tambahan (migrasi 0072, pola sama persis employees) + scoping app-level,
  // BUKAN lewat daftar role di sini. Approve/tolak/pencairan tetap admin-only.
  VIEW_KASBON_REQUESTS: ["super_admin", "company_admin", "department_head", "staff"],
  CREATE_KASBON_REQUEST: ["super_admin", "company_admin", "department_head", "staff"],
  MANAGE_KASBON_REQUESTS: ["super_admin", "company_admin"],

  // Rekonsiliasi Bank (Langkah 9) — pola sama persis dgn VIEW/MANAGE_FIXED_ASSETS.
  VIEW_BANK_RECONCILIATIONS: ["super_admin", "company_admin"],
  MANAGE_BANK_RECONCILIATIONS: ["super_admin", "company_admin"],
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
