import { notFound } from "next/navigation";
import { auth, signOut } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, companyModules } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { ROLE_LABEL, hasPermission, type Role } from "@/lib/rbac/permissions";
import { Sidebar, type SidebarGroup } from "@/components/ui/Sidebar";
import { TopBar } from "@/components/ui/TopBar";
import { getNotificationSummary } from "@/lib/notifications/getNotificationSummary";

export default async function CompanyDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null; // proxy.ts sudah menjamin ini tidak kejadian di praktiknya

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  // 1 query (LEFT JOIN companies + company_modules) di dalam 1 transaksi — dulu ini
  // 2 withTenantContext terpisah (lookup company, lalu 3x isModuleEnabled berurutan),
  // ±12 round-trip DB per page load. Digabung supaya cuma 1 SELECT per page load.
  const rows = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({
        company: companies,
        moduleKey: companyModules.moduleKey,
        moduleEnabled: companyModules.isEnabled,
      })
      .from(companies)
      .leftJoin(companyModules, eq(companyModules.companyId, companies.id))
      .where(eq(companies.slug, companySlug))
  );

  const company = rows[0]?.company;
  if (!company) notFound();

  const enabledModules = new Set(rows.filter((r) => r.moduleEnabled).map((r) => r.moduleKey));
  const suratModuleOn = enabledModules.has("surat_masuk_keluar");
  const dokumenModuleOn = enabledModules.has("pengendalian_dokumen");
  const crmModuleOn = enabledModules.has("crm");
  const sdmDataKaryawanOn = enabledModules.has("sdm_data_karyawan");
  const sdmCutiAbsensiOn = enabledModules.has("sdm_cuti_absensi");
  const sdmKompetensiOn = enabledModules.has("sdm_kompetensi");
  const sdmPayrollOn = enabledModules.has("sdm_payroll");
  const penjadwalanLayananOn = enabledModules.has("penjadwalan_layanan");
  const keuanganModuleOn = enabledModules.has("keuangan");

  const groups: SidebarGroup[] = [];

  const suratItems: SidebarGroup["items"] = [];
  if (suratModuleOn && hasPermission(session.user.role, "VIEW_INCOMING_LETTERS")) {
    suratItems.push({ href: `/${companySlug}/surat-masuk`, label: "Surat Masuk", icon: "inbox" });
  }
  if (suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    suratItems.push({ href: `/${companySlug}/surat-keluar`, label: "Surat Keluar", icon: "send" });
  }
  if (suratItems.length) groups.push({ label: "Surat", icon: "mail", items: suratItems });

  const dokumenItems: SidebarGroup["items"] = [];
  if (dokumenModuleOn && hasPermission(session.user.role, "VIEW_DOCUMENTS")) {
    dokumenItems.push({ href: `/${companySlug}/dokumen`, label: "Dokumen", icon: "file-text" });
  }
  if (
    (dokumenModuleOn && hasPermission(session.user.role, "VIEW_DOCUMENTS")) ||
    (suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS"))
  ) {
    dokumenItems.push({ href: `/${companySlug}/arsip`, label: "Arsip", icon: "archive" });
  }
  if (hasPermission(session.user.role, "VIEW_DASHBOARD_MONITORING")) {
    dokumenItems.push({ href: `/${companySlug}/dokumen/monitoring`, label: "Monitoring", icon: "bar-chart-3" });
  }
  if (dokumenItems.length) groups.push({ label: "Dokumen", icon: "folder", items: dokumenItems });

  const crmItems: SidebarGroup["items"] = [];
  if (crmModuleOn && hasPermission(session.user.role, "VIEW_ORGANIZATIONS")) {
    crmItems.push({ href: `/${companySlug}/crm/organisasi`, label: "Organisasi", icon: "building-2" });
  }
  if (crmModuleOn && hasPermission(session.user.role, "VIEW_OPPORTUNITIES")) {
    crmItems.push({ href: `/${companySlug}/crm/opportunities`, label: "Opportunity", icon: "target" });
  }
  if (crmModuleOn && suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    crmItems.push({ href: `/${companySlug}/crm/proposal`, label: "Proposal", icon: "file-signature" });
  }
  if (crmModuleOn && hasPermission(session.user.role, "VIEW_CONTRACTS")) {
    crmItems.push({ href: `/${companySlug}/crm/contracts`, label: "Contract", icon: "file-check" });
  }
  if (crmModuleOn && hasPermission(session.user.role, "VIEW_OPPORTUNITIES")) {
    crmItems.push({ href: `/${companySlug}/crm/dashboard`, label: "Dashboard CRM", icon: "layout-dashboard" });
  }
  if (crmItems.length) groups.push({ label: "CRM", icon: "handshake", items: crmItems });

  const sdmItems: SidebarGroup["items"] = [];
  if (sdmDataKaryawanOn && hasPermission(session.user.role, "VIEW_EMPLOYEES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/karyawan`, label: "Karyawan", icon: "users" });
  }
  if (sdmCutiAbsensiOn && hasPermission(session.user.role, "VIEW_LEAVE_REQUESTS")) {
    sdmItems.push({ href: `/${companySlug}/sdm/cuti`, label: "Cuti", icon: "calendar-days" });
  }
  if (sdmCutiAbsensiOn && hasPermission(session.user.role, "VIEW_ATTENDANCE")) {
    sdmItems.push({ href: `/${companySlug}/sdm/absensi`, label: "Absensi", icon: "calendar-days" });
  }
  if (sdmCutiAbsensiOn && hasPermission(session.user.role, "MANAGE_LEAVE_TYPES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/jenis-cuti`, label: "Jenis Cuti", icon: "settings" });
  }
  if (sdmKompetensiOn && hasPermission(session.user.role, "VIEW_EMPLOYEE_COMPETENCIES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/kompetensi`, label: "Kompetensi", icon: "award" });
  }
  if (sdmKompetensiOn && hasPermission(session.user.role, "VIEW_CPD_ACTIVITIES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/cpd`, label: "CPD", icon: "award" });
  }
  if (sdmKompetensiOn && hasPermission(session.user.role, "VIEW_CALIBRATION_MEETINGS")) {
    sdmItems.push({ href: `/${companySlug}/sdm/kalibrasi`, label: "Kalibrasi", icon: "users" });
  }
  if (sdmKompetensiOn && hasPermission(session.user.role, "MANAGE_COMPETENCY_TYPES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/jenis-kompetensi`, label: "Jenis Kompetensi", icon: "settings" });
  }
  if (sdmPayrollOn && hasPermission(session.user.role, "VIEW_PAYROLL_RUNS")) {
    sdmItems.push({ href: `/${companySlug}/sdm/payroll`, label: "Payroll", icon: "wallet" });
  }
  if (sdmPayrollOn && hasPermission(session.user.role, "MANAGE_EMPLOYEE_SALARY_STRUCTURE")) {
    sdmItems.push({ href: `/${companySlug}/sdm/struktur-gaji`, label: "Struktur Gaji", icon: "wallet" });
  }
  if (sdmPayrollOn && hasPermission(session.user.role, "MANAGE_SALARY_COMPONENTS")) {
    sdmItems.push({ href: `/${companySlug}/sdm/komponen-gaji`, label: "Komponen Gaji", icon: "settings" });
  }
  // Self-service (Tahap 5) — semua role termasuk staff, gated permission dasar
  // yang sudah dimiliki staff (VIEW_LEAVE_BALANCES/VIEW_CPD_ACTIVITIES/VIEW_PAYSLIPS).
  if (sdmCutiAbsensiOn && hasPermission(session.user.role, "VIEW_LEAVE_BALANCES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/cuti-saya`, label: "Cuti Saya", icon: "calendar-days" });
  }
  if (sdmKompetensiOn && hasPermission(session.user.role, "VIEW_CPD_ACTIVITIES")) {
    sdmItems.push({ href: `/${companySlug}/sdm/cpd-saya`, label: "CPD Saya", icon: "award" });
  }
  if (sdmPayrollOn && hasPermission(session.user.role, "VIEW_PAYSLIPS")) {
    sdmItems.push({ href: `/${companySlug}/sdm/gaji-saya`, label: "Gaji Saya", icon: "wallet" });
  }
  // Kasbon (Fase 3 Langkah 8) SENGAJA TIDAK di-gate module_key apa pun (beda dari
  // seluruh halaman Keuangan lain di bawah) — ini fitur self-service karyawan, bukan
  // laporan keuangan, jadi harus tetap bisa diakses staff terlepas modul Keuangan
  // aktif atau tidak (lihat komentar requireModuleEnabled absen di keuangan/kasbon/page.tsx).
  if (hasPermission(session.user.role, "VIEW_KASBON_REQUESTS")) {
    sdmItems.push({ href: `/${companySlug}/keuangan/kasbon`, label: "Kasbon", icon: "wallet" });
  }
  if (sdmItems.length) groups.push({ label: "SDM", icon: "contact", items: sdmItems });

  // Fase 4 — grup sendiri, terpisah dari SDM (keputusan spesifikasi Bagian 1).
  const penjadwalanItems: SidebarGroup["items"] = [];
  if (penjadwalanLayananOn && hasPermission(session.user.role, "VIEW_SERVICE_ASSIGNMENTS")) {
    penjadwalanItems.push({ href: `/${companySlug}/penjadwalan`, label: "Penjadwalan", icon: "users" });
    penjadwalanItems.push({ href: `/${companySlug}/penjadwalan/kalender`, label: "Kalender", icon: "calendar-days" });
    penjadwalanItems.push({ href: `/${companySlug}/penjadwalan/rekap`, label: "Rekap Tahunan", icon: "bar-chart-3" });
  }
  if (penjadwalanItems.length) groups.push({ label: "Penjadwalan", icon: "calendar-days", items: penjadwalanItems });

  // Fase 3 — grup sendiri (Langkah 10). Semua item di sini admin-only (super_admin/
  // company_admin, lihat rbac/permissions.ts) — staff/department_head tidak akan
  // pernah melihat grup ini sama sekali (Kasbon, satu-satunya halaman Keuangan yang
  // staff akses, sengaja ditaruh di grup SDM di atas, bukan di sini).
  const keuanganItems: SidebarGroup["items"] = [];
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_CHART_OF_ACCOUNTS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/akun`, label: "Chart of Accounts", icon: "file-text" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_JOURNAL_ENTRIES")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/jurnal`, label: "Jurnal Umum", icon: "file-text" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_FINANCIAL_REPORTS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/buku-besar`, label: "Buku Besar", icon: "bar-chart-3" });
    keuanganItems.push({ href: `/${companySlug}/keuangan/neraca`, label: "Neraca", icon: "bar-chart-3" });
    keuanganItems.push({ href: `/${companySlug}/keuangan/laba-rugi`, label: "Laba Rugi", icon: "bar-chart-3" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_AR_INVOICES")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/piutang`, label: "Piutang (AR)", icon: "wallet" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_HPP_PROJECT_COSTS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/hpp`, label: "Biaya Proyek (HPP)", icon: "wallet" });
    keuanganItems.push({ href: `/${companySlug}/keuangan/margin-proyek`, label: "Margin Proyek", icon: "bar-chart-3" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_RKAP_BUDGETS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/rkap`, label: "RKAP", icon: "calculator" });
    keuanganItems.push({ href: `/${companySlug}/keuangan/rkap/realisasi`, label: "Realisasi Anggaran", icon: "calculator" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_FIXED_ASSETS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/aset-tetap`, label: "Aset Tetap", icon: "landmark" });
    keuanganItems.push({ href: `/${companySlug}/keuangan/aset-tetap/penyusutan`, label: "Penyusutan", icon: "landmark" });
  }
  if (keuanganModuleOn && hasPermission(session.user.role, "VIEW_BANK_RECONCILIATIONS")) {
    keuanganItems.push({ href: `/${companySlug}/keuangan/rekonsiliasi-bank`, label: "Rekonsiliasi Bank", icon: "landmark" });
  }
  if (keuanganItems.length) groups.push({ label: "Keuangan", icon: "landmark", items: keuanganItems });

  const settingsItems: SidebarGroup["items"] = [];
  if (hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    settingsItems.push({ href: `/${companySlug}/pengaturan`, label: "Pengaturan", icon: "settings" });
  }
  if (session.user.role === "super_admin") {
    settingsItems.push({ href: "/pilih-perusahaan", label: "Ganti Perusahaan", icon: "arrow-left-right" });
  }
  if (settingsItems.length) groups.push({ items: settingsItems });

  // Notifikasi lonceng top bar (redesign Bagian 3) — gate per sumber pakai flag
  // module aktif + permission yang sama dipakai untuk bangun sidebar di atas,
  // supaya konsisten dengan apa yang benar-benar bisa diakses user ini.
  const notification = await withTenantContext(tenantContext, (tx) =>
    getNotificationSummary(tx, {
      companyId: company.id,
      userId: session.user.id,
      role: session.user.role as Role,
      companySlug,
      flags: {
        competency: sdmKompetensiOn && hasPermission(session.user.role, "VIEW_EMPLOYEE_COMPETENCIES"),
        leaveApproval: sdmCutiAbsensiOn && hasPermission(session.user.role, "APPROVE_LEAVE_REQUEST"),
        documents: dokumenModuleOn && hasPermission(session.user.role, "VIEW_DOCUMENTS"),
      },
    })
  );

  return (
    <div className="h-screen flex bg-bg-base">
      <Sidebar
        groups={groups}
        companyName={company.name}
        companyCode={company.code}
        companyTagline={company.businessType}
        companyLogoUrl={company.logoUrl}
        onLogout={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          groups={groups}
          userName={session.user.name ?? session.user.email ?? "User"}
          roleLabel={ROLE_LABEL[session.user.role as keyof typeof ROLE_LABEL] ?? session.user.role}
          notification={notification}
        />
        <main className="flex-1 px-6 py-3.5 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
