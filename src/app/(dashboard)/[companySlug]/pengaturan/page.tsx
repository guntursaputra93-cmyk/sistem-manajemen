import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { isModuleEnabled } from "@/lib/modules";
import { updateCompanyCode } from "./actions";

export default async function PengaturanPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const canEditCompanyCode = hasPermission(session.user.role, "MANAGE_COMPANIES");
  const crmModuleOn = await withTenantContext(tenantContext, (tx) => isModuleEnabled(tx, { companyId: company.id, moduleKey: "crm" }));

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Pengaturan</h1>
        <p className="text-gray-500 text-sm mt-1">
          Kode perusahaan & departemen dipakai untuk format nomor surat/nota dinas.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          Kode berhasil disimpan.
        </div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Kode Perusahaan</h2>
        <p className="text-xs text-gray-500 mb-4">Contoh: SMU. Huruf besar & angka, 2-10 karakter.</p>
        {canEditCompanyCode ? (
          <form action={updateCompanyCode} className="flex items-center gap-3">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input
              name="code"
              defaultValue={company.code ?? ""}
              placeholder="mis. SMU"
              maxLength={10}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-40 uppercase"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Simpan
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-700">
            {company.code ?? <span className="text-gray-400 italic">Belum diatur</span>}
          </p>
        )}
      </section>

      {hasPermission(session.user.role, "MANAGE_DEPARTMENTS") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Departemen</h2>
          <p className="text-xs text-gray-500 mb-4">Tambah, ubah, atau hapus departemen (nama, kode, induk).</p>
          <Link href={`/${companySlug}/pengaturan/departemen`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan departemen &rarr;
          </Link>
        </section>
      )}

      {hasPermission(session.user.role, "MANAGE_USERS") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">User</h2>
          <p className="text-xs text-gray-500 mb-4">Kelola akun user — nama, email, role, departemen.</p>
          <Link href={`/${companySlug}/pengaturan/user`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan user &rarr;
          </Link>
        </section>
      )}

      {hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Jenjang Approval</h2>
          <p className="text-xs text-gray-500 mb-4">
            Atur urutan approval per jenis surat keluar/nota dinas/dokumen.
          </p>
          <Link href={`/${companySlug}/pengaturan/approval`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan jenjang approval &rarr;
          </Link>
        </section>
      )}

      {hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Kategori Dokumen</h2>
          <p className="text-xs text-gray-500 mb-4">Atur kode kategori dokumen (Peraturan Perusahaan, SK Direktur, dst).</p>
          <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan kategori dokumen &rarr;
          </Link>
        </section>
      )}

      {hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Jenjang Akses Dokumen</h2>
          <p className="text-xs text-gray-500 mb-4">Default semua staf bisa lihat — atur rule kalau mau membatasi.</p>
          <Link href={`/${companySlug}/pengaturan/akses-dokumen`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan jenjang akses &rarr;
          </Link>
        </section>
      )}

      {hasPermission(session.user.role, "MANAGE_MODULES") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Modul Aktif</h2>
          <p className="text-xs text-gray-500 mb-4">Aktif/nonaktifkan Surat Masuk-Keluar & Pengendalian Dokumen.</p>
          <Link href={`/${companySlug}/pengaturan/modul`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan modul &rarr;
          </Link>
        </section>
      )}

      {crmModuleOn && hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES") && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Tahap Pipeline (CRM)</h2>
          <p className="text-xs text-gray-500 mb-4">Atur tahap penjualan (lead, kualifikasi, menang, hilang, dst).</p>
          <Link href={`/${companySlug}/pengaturan/pipeline`} className="text-sm text-blue-600 hover:underline">
            Buka pengaturan pipeline &rarr;
          </Link>
        </section>
      )}
    </div>
  );
}
