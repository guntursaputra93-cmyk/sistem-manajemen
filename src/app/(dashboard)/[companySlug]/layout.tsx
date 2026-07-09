import { notFound } from "next/navigation";
import { auth, signOut } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, companyModules } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { ROLE_LABEL, hasPermission } from "@/lib/rbac/permissions";
import { Sidebar, type SidebarGroup } from "@/components/ui/Sidebar";
import { TopBar } from "@/components/ui/TopBar";

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
  // sdm_payroll ditambahkan di sini seiring halamannya dibangun (Fase 2 Tahap 4).
  const sdmDataKaryawanOn = enabledModules.has("sdm_data_karyawan");
  const sdmCutiAbsensiOn = enabledModules.has("sdm_cuti_absensi");
  const sdmKompetensiOn = enabledModules.has("sdm_kompetensi");

  const groups: SidebarGroup[] = [];

  const suratItems: SidebarGroup["items"] = [];
  if (suratModuleOn && hasPermission(session.user.role, "VIEW_INCOMING_LETTERS")) {
    suratItems.push({ href: `/${companySlug}/surat-masuk`, label: "Surat Masuk", icon: "inbox" });
  }
  if (suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    suratItems.push({ href: `/${companySlug}/surat-keluar`, label: "Surat Keluar", icon: "send" });
  }
  if (suratItems.length) groups.push({ label: "Surat", items: suratItems });

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
  if (dokumenItems.length) groups.push({ label: "Dokumen", items: dokumenItems });

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
  if (crmItems.length) groups.push({ label: "CRM", items: crmItems });

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
  if (sdmItems.length) groups.push({ label: "SDM", items: sdmItems });

  const settingsItems: SidebarGroup["items"] = [];
  if (hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    settingsItems.push({ href: `/${companySlug}/pengaturan`, label: "Pengaturan", icon: "settings" });
  }
  if (session.user.role === "super_admin") {
    settingsItems.push({ href: "/pilih-perusahaan", label: "Ganti Perusahaan", icon: "arrow-left-right" });
  }
  if (settingsItems.length) groups.push({ items: settingsItems });

  return (
    <div className="h-screen flex bg-bg-base">
      <Sidebar groups={groups} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          companyName={company.name}
          roleLabel={ROLE_LABEL[session.user.role as keyof typeof ROLE_LABEL] ?? session.user.role}
          actions={
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="text-sm text-ink-muted hover:text-ink transition-colors">
                Keluar
              </button>
            </form>
          }
        />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
