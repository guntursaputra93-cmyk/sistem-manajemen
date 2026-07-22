import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, like } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, fixedAssets, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createAsset, changeAssetStatus } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = { aktif: "Aktif", dijual: "Dijual", dihapuskan: "Dihapuskan" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { aktif: "sage", dijual: "powder-blue", dihapuskan: "destructive" };

export default async function FixedAssetsPage({
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

  if (!hasPermission(session.user.role, "VIEW_FIXED_ASSETS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_FIXED_ASSETS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [assetList, assetAccounts, accumAccounts, expenseAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(fixedAssets).where(eq(fixedAssets.companyId, company.id)).orderBy(asc(fixedAssets.acquisitionDate))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), like(chartOfAccounts.code, "121%"), eq(chartOfAccounts.isHeader, false)))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), like(chartOfAccounts.code, "122%"), eq(chartOfAccounts.isHeader, false)))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.accountType, "biaya"), eq(chartOfAccounts.isHeader, false)))
    ),
  ]);

  const accountLabelById = new Map([...assetAccounts, ...accumAccounts, ...expenseAccounts].map((a) => [a.id, `${a.code} · ${a.name}`]));

  const columns: DataTableColumn<(typeof assetList)[number]>[] = [
    { key: "name", header: "Nama Aset", render: (a) => a.assetName },
    { key: "account", header: "Akun Aset", render: (a) => accountLabelById.get(a.accountId) ?? "-" },
    { key: "date", header: "Tgl Perolehan", render: (a) => new Date(a.acquisitionDate).toLocaleDateString("id-ID") },
    { key: "cost", header: "Harga Perolehan", render: (a) => formatRupiah(a.acquisitionCost), className: "text-right" },
    { key: "life", header: "Masa Manfaat", render: (a) => `${a.usefulLifeMonths} bln` },
    { key: "accumulated", header: "Akumulasi Penyusutan", render: (a) => formatRupiah(a.accumulatedDepreciation), className: "text-right" },
    {
      key: "bookValue",
      header: "Nilai Buku",
      render: (a) => formatRupiah(Number(a.acquisitionCost) - Number(a.accumulatedDepreciation)),
      className: "text-right font-semibold",
    },
    {
      key: "status",
      header: "Status",
      render: (a) =>
        canManage ? (
          <form action={changeAssetStatus} className="flex items-center gap-1">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assetId" value={a.id} />
            <select name="status" defaultValue={a.status} className="border border-ink-muted/12 rounded-lg px-1.5 py-1 text-[10px] text-ink bg-bg-base">
              <option value="aktif">Aktif</option>
              <option value="dijual">Dijual</option>
              <option value="dihapuskan">Dihapuskan</option>
            </select>
            <button type="submit" className="text-sage-deep hover:underline text-[10px] font-semibold">
              Simpan
            </button>
          </form>
        ) : (
          <Badge variant={STATUS_VARIANT[a.status] ?? "powder-blue"}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Aset Tetap" }]}
        title="Aset Tetap"
        description={`Daftar aset tetap ${company.name}.`}
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Tambah Aset"
              title="Tambah Aset Tetap"
              description="Akun Aset kelompok 121xx, Akumulasi Penyusutan kelompok 122xx."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {assetAccounts.length === 0 || accumAccounts.length === 0 || expenseAccounts.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Akun 121xx / 122xx / biaya posting belum lengkap di Chart of Accounts.</p>
              ) : (
                <form action={createAsset}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <FormSection title="① Data Aset">
                    <FormField label="Nama Aset *" full>
                      <input autoComplete="off" name="assetName" required placeholder="mis. Laptop Auditor #3" className={inputClass} />
                    </FormField>
                    <FormField label="Tanggal Perolehan *">
                      <input autoComplete="off" name="acquisitionDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
                    </FormField>
                    <FormField label="Harga Perolehan *">
                      <input autoComplete="off" name="acquisitionCost" type="number" step="0.01" min="0.01" required placeholder="0" className={inputClass} />
                    </FormField>
                    <FormField label="Masa Manfaat (bulan) *">
                      <input autoComplete="off" name="usefulLifeMonths" type="number" step="1" min="1" required placeholder="mis. 48" className={inputClass} />
                    </FormField>
                  </FormSection>
                  <FormSection title="② Akun Terkait">
                    <FormField label="Akun Aset (121xx) *" full>
                      <select name="accountId" required className={inputClass}>
                        {assetAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Akun Akumulasi Penyusutan (122xx) *" full>
                      <select name="accumulatedDepreciationAccountId" required className={inputClass}>
                        {accumAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Akun Beban Penyusutan *" full>
                      <select name="depreciationExpenseAccountId" required className={inputClass}>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Tambah Aset" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={assetList} rowKey={(a) => a.id} emptyMessage="Belum ada aset tetap." />

      <p className="text-xs text-ink-muted">
        Jalankan penyusutan bulanan di{" "}
        <Link href={`/${companySlug}/keuangan/aset-tetap/penyusutan`} className="text-sage-deep hover:underline">
          halaman Penyusutan
        </Link>
        .
      </p>
    </div>
  );
}
