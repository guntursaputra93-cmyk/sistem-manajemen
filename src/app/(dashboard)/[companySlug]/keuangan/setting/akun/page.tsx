import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { openItemTriggerSide } from "@/lib/finance/openItems";
import { createChartOfAccount, updateChartOfAccount, deleteChartOfAccount } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { RowDrawer } from "@/components/ui/RowDrawer";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  aset: "Aset",
  kewajiban: "Kewajiban",
  modal: "Modal",
  pendapatan: "Pendapatan",
  hpp: "HPP",
  biaya: "Biaya",
};

export default async function ChartOfAccountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; q?: string; tipe?: string; sifat?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, tipe, sifat, status } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CHART_OF_ACCOUNTS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_CHART_OF_ACCOUNTS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  // ORDER BY code cukup buat urutan tampilan pohon yang benar tanpa recursive CTE —
  // skema penomoran akun ini memang disusun supaya kode anak selalu terurut tepat
  // setelah kode induknya (lihat chartOfAccountsSeed.ts).
  const accountList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, company.id)).orderBy(asc(chartOfAccounts.code))
  );
  const headerAccounts = accountList.filter((a) => a.isHeader);

  // Penyaringan server-side dari ?q= / ?tipe= / ?sifat= / ?status= yang di-set
  // ListToolbar. Indentasi pohon tetap dihitung dari level tiap baris, jadi hasil
  // filter tetap terbaca meski sebagian induk ikut tersembunyi.
  const needle = q?.trim().toLowerCase();
  const filtered = accountList.filter((a) => {
    if (needle) {
      const haystack = `${a.code} ${a.name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (tipe && a.accountType !== tipe) return false;
    if (sifat === "header" && !a.isHeader) return false;
    if (sifat === "posting" && a.isHeader) return false;
    if (status === "aktif" && !a.isActive) return false;
    if (status === "nonaktif" && a.isActive) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold text-ink">Chart of Accounts</h2>
          <p className="text-[13px] text-ink-muted">Daftar akun untuk {company.name} — {accountList.length} akun.</p>
        </div>
        {canManage && (
          <FormDrawer
            buttonLabel="Tambah Akun"
            title="Tambah Akun"
            description="Akun baru selalu berupa akun posting, di bawah salah satu akun header."
            defaultOpen={Boolean(error)}
          >
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={createChartOfAccount}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <FormSection title="Detail Akun">
                <FormField label="Akun Induk *" full>
                  <select name="parentId" required className={inputClass}>
                    {headerAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {"— ".repeat(a.level - 1)}{a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Kode *">
                  <input autoComplete="off" name="code" required placeholder="mis. 11204" className={inputClass} />
                </FormField>
                <FormField label="Nama *">
                  <input autoComplete="new-password" name="name" required placeholder="mis. Bank Danamon" className={inputClass} />
                </FormField>
                <FormField label="Akun Kontra" full>
                  <label className="flex items-center gap-2 py-1 text-[13px] text-ink">
                    <input type="checkbox" id="isContra" name="isContra" className="h-4 w-4 accent-peach-deep" />
                    Saldo normal dibalik dari induknya
                  </label>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Akun" />
            </form>
          </FormDrawer>
        )}
      </div>

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {accountList.length === 0 ? (
        <EmptyState message="Belum ada akun. Akun standar seharusnya sudah ter-seed otomatis — hubungi super admin kalau daftar ini kosong." />
      ) : (
        <>
          <ListToolbar
            searchPlaceholder="Cari kode atau nama akun…"
            filters={[
              {
                name: "tipe",
                allLabel: "Semua Tipe",
                options: Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label })),
              },
              {
                name: "sifat",
                allLabel: "Semua Sifat",
                options: [
                  { value: "header", label: "Header" },
                  { value: "posting", label: "Posting" },
                ],
              },
              {
                name: "status",
                allLabel: "Semua Status",
                options: [
                  { value: "aktif", label: "Aktif" },
                  { value: "nonaktif", label: "Nonaktif" },
                ],
              },
            ]}
            countLabel={`${filtered.length} akun`}
          />

          <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tl-[14px] w-[110px]">Kode</th>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Nama Akun</th>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Tipe</th>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Saldo Normal</th>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Sifat</th>
                  <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Status</th>
                  {canManage && <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tr-[14px] w-[80px]">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-ink-muted italic">
                      Tidak ada akun yang cocok dengan pencarian/filter.
                    </td>
                  </tr>
                )}
                {filtered.map((a) => (
                  <tr key={a.id} className={`border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors ${a.isActive ? "" : "opacity-55"}`}>
                    <td className={`px-4 py-3 whitespace-nowrap ${a.isHeader ? "font-bold text-ink" : "text-ink"}`}>{a.code}</td>
                    <td className="px-4 py-3">
                      <span
                        style={{ paddingLeft: `${(a.level - 1) * 18}px` }}
                        className={`block ${a.isHeader ? "font-bold text-ink" : "text-ink"}`}
                      >
                        {a.name}
                        {a.isOpenItem && (
                          <span className="ml-2 rounded-[6px] bg-sage/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sage-deep">
                            terbuka saat {openItemTriggerSide(a.openItemType)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="powder-blue">{ACCOUNT_TYPE_LABEL[a.accountType]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.normalBalance === "debit" ? "sage" : "dusty-rose"}>{a.normalBalance === "debit" ? "Debit" : "Kredit"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.isHeader ? "powder-blue" : "sage"}>{a.isHeader ? "Header" : "Posting"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.isActive ? "sage" : "destructive"}>{a.isActive ? "Aktif" : "Nonaktif"}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <RowDrawer
                          triggerLabel="Edit"
                          title={`Edit Akun · ${a.code}`}
                          description="Kode, tipe, dan saldo normal akun tidak bisa diubah — hanya nama dan status."
                        >
                          <form action={updateChartOfAccount}>
                            <input type="hidden" name="companySlug" value={companySlug} />
                            <input type="hidden" name="companyId" value={company.id} />
                            <input type="hidden" name="accountId" value={a.id} />
                            {/* Info read-only kompak (tidak bisa diubah) — menggantikan 4 kotak input
                                yang bikin drawer terlalu panjang & mepet. */}
                            <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[10px] border border-ink-muted/12 bg-bg-base px-3.5 py-3">
                              <div className="flex flex-col">
                                <span className="text-[11px] text-ink-muted">Kode</span>
                                <span className="text-[13px] font-semibold text-ink">{a.code}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] text-ink-muted">Tipe</span>
                                <span className="text-[13px] font-semibold text-ink">{ACCOUNT_TYPE_LABEL[a.accountType]}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] text-ink-muted">Saldo Normal</span>
                                <span className="text-[13px] font-semibold text-ink">{a.normalBalance === "debit" ? "Debit" : "Kredit"}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] text-ink-muted">Sifat</span>
                                <span className="text-[13px] font-semibold text-ink">{a.isHeader ? "Header (grup)" : "Posting"}</span>
                              </div>
                            </div>
                            <FormSection title="Detail Akun">
                              <FormField label="Nama *" full>
                                <input autoComplete="new-password" name="name" defaultValue={a.name} required className={inputClass} />
                              </FormField>
                              <FormField label="Status" full>
                                <select name="isActive" defaultValue={String(a.isActive)} className={inputClass}>
                                  <option value="true">Aktif</option>
                                  <option value="false">Nonaktif</option>
                                </select>
                              </FormField>
                            </FormSection>
                            {!a.isHeader && (
                              <FormSection title="Transaksi Terbuka">
                                <FormField label="Aktifkan" full optional>
                                  <label className="flex items-start gap-2.5 rounded-[9px] border border-ink-muted/12 bg-bg-base px-3 py-2.5 text-[13px] text-ink">
                                    <input type="checkbox" name="isOpenItem" defaultChecked={a.isOpenItem} className="mt-0.5 h-4 w-4 shrink-0 accent-sage-deep" />
                                    <span>Buka transaksi terbuka otomatis saat akun ini dipakai di jurnal — mis. uang muka menunggu pertanggungjawaban, atau DP menunggu pelunasan.</span>
                                  </label>
                                </FormField>
                                <FormField
                                  label="Jenis"
                                  full
                                  hint="Arah pemicunya mengikuti jenis: Uang Muka & Lainnya terbuka saat akun DIDEBET; DP Diterima terbuka saat akun DIKREDIT."
                                >
                                  <select name="openItemType" defaultValue={a.openItemType ?? "uang_muka"} className={inputClass}>
                                    <option value="uang_muka">Uang Muka — terbuka saat didebet</option>
                                    <option value="dp_diterima">DP Diterima — terbuka saat dikredit</option>
                                    <option value="lainnya">Lainnya — terbuka saat didebet</option>
                                  </select>
                                </FormField>
                              </FormSection>
                            )}
                            <DrawerFooter submitLabel="Simpan Perubahan" />
                          </form>
                          <form action={deleteChartOfAccount} className="mt-4 border-t border-ink-muted/12 pt-4">
                            <input type="hidden" name="companySlug" value={companySlug} />
                            <input type="hidden" name="companyId" value={company.id} />
                            <input type="hidden" name="accountId" value={a.id} />
                            <p className="mb-2 text-[11px] text-ink-muted">
                              Akun yang sudah punya turunan atau sudah dipakai transaksi tidak bisa dihapus — nonaktifkan saja.
                            </p>
                            <button type="submit" className="cursor-pointer text-[13px] font-medium text-destructive hover:underline">
                              Hapus Akun
                            </button>
                          </form>
                        </RowDrawer>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
