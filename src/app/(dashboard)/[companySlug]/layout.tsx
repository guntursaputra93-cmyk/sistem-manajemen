import { notFound } from "next/navigation";
import { auth, signOut } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { ROLE_LABEL, hasPermission } from "@/lib/rbac/permissions";
import { isModuleEnabled } from "@/lib/modules";
import Link from "next/link";

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

  const [suratModuleOn, dokumenModuleOn] = await withTenantContext(tenantContext, (tx) =>
    Promise.all([
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar" }),
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen" }),
    ])
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{company.name}</p>
          <p className="text-xs text-gray-500">{ROLE_LABEL[session.user.role as keyof typeof ROLE_LABEL] ?? session.user.role}</p>
        </div>
        <div className="flex items-center gap-4">
          {suratModuleOn && hasPermission(session.user.role, "VIEW_INCOMING_LETTERS") && (
            <Link href={`/${companySlug}/surat-masuk`} className="text-sm text-blue-600 hover:underline">
              Surat Masuk
            </Link>
          )}
          {suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS") && (
            <Link href={`/${companySlug}/surat-keluar`} className="text-sm text-blue-600 hover:underline">
              Surat Keluar
            </Link>
          )}
          {dokumenModuleOn && hasPermission(session.user.role, "VIEW_DOCUMENTS") && (
            <Link href={`/${companySlug}/dokumen`} className="text-sm text-blue-600 hover:underline">
              Dokumen
            </Link>
          )}
          {((dokumenModuleOn && hasPermission(session.user.role, "VIEW_DOCUMENTS")) ||
            (suratModuleOn && hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS"))) && (
            <Link href={`/${companySlug}/arsip`} className="text-sm text-blue-600 hover:underline">
              Arsip
            </Link>
          )}
          {hasPermission(session.user.role, "MANAGE_DEPARTMENTS") && (
            <Link href={`/${companySlug}/pengaturan`} className="text-sm text-blue-600 hover:underline">
              Pengaturan
            </Link>
          )}
          {session.user.role === "super_admin" && (
            <Link href="/pilih-perusahaan" className="text-sm text-blue-600 hover:underline">
              Ganti Perusahaan
            </Link>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">
              Keluar
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
