import { notFound } from "next/navigation";
import { auth, signOut } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { ROLE_LABEL, hasPermission } from "@/lib/rbac/permissions";
import { isModuleEnabled } from "@/lib/modules";
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

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );

  if (!company) notFound();

  const [suratModuleOn, dokumenModuleOn, crmModuleOn] = await withTenantContext(tenantContext, (tx) =>
    Promise.all([
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar" }),
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen" }),
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "crm" }),
    ])
  );

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
