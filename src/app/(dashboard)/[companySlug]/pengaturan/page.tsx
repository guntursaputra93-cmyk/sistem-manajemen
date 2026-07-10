import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { isModuleEnabled } from "@/lib/modules";
import { updateCompanyCode } from "./actions";
import { Card } from "@/components/ui/Card";

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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Pengaturan</h1>
        <p className="text-sm text-ink-muted mt-1">Kode perusahaan &amp; departemen dipakai untuk format nomor surat/nota dinas.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Kode berhasil disimpan.</div>}

      <Card title="Kode Perusahaan" description="Contoh: SMU. Huruf besar & angka, 2-10 karakter.">
        {canEditCompanyCode ? (
          <form action={updateCompanyCode} className="flex items-center gap-3">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input
              name="code"
              defaultValue={company.code ?? ""}
              placeholder="mis. SMU"
              maxLength={10}
              className="border border-ink-muted/20 rounded-lg px-3 py-2 text-sm w-40 uppercase text-ink bg-surface"
            />
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Simpan
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink">{company.code ?? <span className="text-ink-muted italic">Belum diatur</span>}</p>
        )}
      </Card>

      {hasPermission(session.user.role, "MANAGE_DEPARTMENTS") && (
        <Card title="Departemen" description="Tambah, ubah, atau hapus departemen (nama, kode, induk).">
          <Link href={`/${companySlug}/pengaturan/departemen`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan departemen &rarr;
          </Link>
        </Card>
      )}

      {hasPermission(session.user.role, "MANAGE_USERS") && (
        <Card title="User" description="Kelola akun user — nama, email, role, departemen.">
          <Link href={`/${companySlug}/pengaturan/user`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan user &rarr;
          </Link>
        </Card>
      )}

      {hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS") && (
        <Card title="Jenjang Approval" description="Atur urutan approval per jenis surat keluar/nota dinas/dokumen.">
          <Link href={`/${companySlug}/pengaturan/approval`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan jenjang approval &rarr;
          </Link>
        </Card>
      )}

      {hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES") && (
        <Card title="Kategori Dokumen" description="Atur kode kategori dokumen (Peraturan Perusahaan, SK Direktur, dst).">
          <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan kategori dokumen &rarr;
          </Link>
        </Card>
      )}

      {hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES") && (
        <Card title="Jenjang Akses Dokumen" description="Default semua staf bisa lihat — atur rule kalau mau membatasi.">
          <Link href={`/${companySlug}/pengaturan/akses-dokumen`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan jenjang akses &rarr;
          </Link>
        </Card>
      )}

      {hasPermission(session.user.role, "MANAGE_MODULES") && (
        <Card title="Modul Aktif" description="Aktif/nonaktifkan Surat Masuk-Keluar & Pengendalian Dokumen.">
          <Link href={`/${companySlug}/pengaturan/modul`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan modul &rarr;
          </Link>
        </Card>
      )}

      {crmModuleOn && hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES") && (
        <Card title="Tahap Pipeline (CRM)" description="Atur tahap penjualan (lead, kualifikasi, menang, hilang, dst).">
          <Link href={`/${companySlug}/pengaturan/pipeline`} className="text-sm text-sage-deep hover:underline">
            Buka pengaturan pipeline &rarr;
          </Link>
        </Card>
      )}
    </div>
  );
}
