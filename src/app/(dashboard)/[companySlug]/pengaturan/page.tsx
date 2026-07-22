import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { isModuleEnabled } from "@/lib/modules";
import { PageHeader } from "@/components/ui/PageHeader";
import { updateCompanyCode } from "./actions";
import { Tag, Building2, Users, CheckSquare, FileText, Shield, LayoutGrid, Target, type LucideIcon } from "lucide-react";

const TILE_CLASS = "bg-surface rounded-xl border-t-4 border-sage-deep shadow-[0_2px_10px_rgba(0,0,0,0.05)] p-4 flex flex-col gap-2 min-h-[148px]";
const LINK_TILE_CLASS = `${TILE_CLASS} transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)]`;

function TileIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-sage/20 text-sage-deep">
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Pengaturan" }]}
        title="Pengaturan"
        description="Kode perusahaan & departemen dipakai untuk format nomor surat/nota dinas."
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Kode berhasil disimpan.</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={TILE_CLASS}>
          <div className="flex items-center gap-2">
            <TileIcon icon={Tag} />
            <p className="text-[13px] font-bold text-ink leading-tight">Kode Perusahaan</p>
          </div>
          <p className="text-[11.5px] text-ink-muted leading-relaxed">Contoh: SMU. Huruf besar &amp; angka, 2-10 karakter.</p>
          {canEditCompanyCode ? (
            <form action={updateCompanyCode} className="flex items-center gap-2 mt-auto pt-1">
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="companySlug" value={companySlug} />
              <input autoComplete="off"
                name="code"
                defaultValue={company.code ?? ""}
                placeholder="mis. SMU"
                maxLength={10}
                className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] w-20 uppercase text-ink bg-bg-base"
              />
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-[6px] rounded-lg transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink mt-auto pt-1">{company.code ?? <span className="text-ink-muted italic">Belum diatur</span>}</p>
          )}
        </div>

        {hasPermission(session.user.role, "MANAGE_DEPARTMENTS") && (
          <Link href={`/${companySlug}/pengaturan/departemen`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={Building2} />
              <p className="text-[13px] font-bold text-ink leading-tight">Departemen</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Tambah, ubah, atau hapus departemen (nama, kode, induk).</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka pengaturan departemen &rarr;</p>
          </Link>
        )}

        {hasPermission(session.user.role, "MANAGE_USERS") && (
          <Link href={`/${companySlug}/pengaturan/user`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={Users} />
              <p className="text-[13px] font-bold text-ink leading-tight">User</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Kelola akun user — nama, email, role, departemen.</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka pengaturan user &rarr;</p>
          </Link>
        )}

        {hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS") && (
          <Link href={`/${companySlug}/pengaturan/approval`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={CheckSquare} />
              <p className="text-[13px] font-bold text-ink leading-tight">Jenjang Approval</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Atur urutan approval per jenis surat keluar/nota dinas/dokumen.</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka jenjang approval &rarr;</p>
          </Link>
        )}

        {hasPermission(session.user.role, "MANAGE_DOCUMENT_CATEGORIES") && (
          <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={FileText} />
              <p className="text-[13px] font-bold text-ink leading-tight">Kategori Dokumen</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Atur kode kategori dokumen (Peraturan Perusahaan, SK Direktur, dst).</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka kategori dokumen &rarr;</p>
          </Link>
        )}

        {hasPermission(session.user.role, "MANAGE_DOCUMENT_ACCESS_RULES") && (
          <Link href={`/${companySlug}/pengaturan/akses-dokumen`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={Shield} />
              <p className="text-[13px] font-bold text-ink leading-tight">Jenjang Akses Dokumen</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Default semua staf bisa lihat — atur rule kalau mau membatasi.</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka jenjang akses &rarr;</p>
          </Link>
        )}

        {hasPermission(session.user.role, "MANAGE_MODULES") && (
          <Link href={`/${companySlug}/pengaturan/modul`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={LayoutGrid} />
              <p className="text-[13px] font-bold text-ink leading-tight">Modul Aktif</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Aktif/nonaktifkan modul bisnis untuk {company.name}.</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka pengaturan modul &rarr;</p>
          </Link>
        )}

        {crmModuleOn && hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES") && (
          <Link href={`/${companySlug}/pengaturan/pipeline`} className={LINK_TILE_CLASS}>
            <div className="flex items-center gap-2">
              <TileIcon icon={Target} />
              <p className="text-[13px] font-bold text-ink leading-tight">Tahap Pipeline (CRM)</p>
            </div>
            <p className="text-[11.5px] text-ink-muted leading-relaxed flex-1">Atur tahap penjualan (lead, kualifikasi, menang, hilang, dst).</p>
            <p className="text-[11.5px] font-bold text-sage-deep">Buka pengaturan pipeline &rarr;</p>
          </Link>
        )}
      </div>
    </div>
  );
}
