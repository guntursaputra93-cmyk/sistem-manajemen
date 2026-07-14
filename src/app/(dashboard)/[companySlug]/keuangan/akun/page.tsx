import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createChartOfAccount, updateChartOfAccount, deleteChartOfAccount } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Chart of Accounts</h1>
        <p className="text-sm text-ink-muted mt-1">Daftar akun untuk {company.name} — {accountList.length} akun.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card title="Tambah Akun" description="Akun baru selalu berupa akun posting (transaksi), dibuat di bawah salah satu akun header yang sudah ada.">
          <form action={createChartOfAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun Induk</label>
              <select name="parentId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {headerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {"— ".repeat(a.level - 1)}{a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
              <input autoComplete="off" name="code" required placeholder="mis. 11204" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
              <input autoComplete="new-password" name="name" required placeholder="mis. Bank Danamon" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isContra" name="isContra" className="h-3.5 w-3.5" />
              <label htmlFor="isContra" className="text-[10.5px] text-ink-muted">Akun kontra (saldo normal dibalik dari induknya)</label>
            </div>
            <div className="lg:col-span-4">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Tambah
              </button>
            </div>
          </form>
        </Card>
      )}

      <section className="space-y-1.5">
        {accountList.length === 0 && <EmptyState message="Belum ada akun. Akun standar seharusnya sudah ter-seed otomatis — hubungi super admin kalau daftar ini kosong." />}
        {accountList.map((a) => (
          <div
            key={a.id}
            style={{ marginLeft: `${(a.level - 1) * 20}px` }}
            className={`bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-3 ${a.isActive ? "" : "opacity-50"}`}
          >
            <form action={updateChartOfAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="accountId" value={a.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kode</label>
                <p className={`text-[11px] py-[6px] ${a.isHeader ? "font-bold text-ink" : "text-ink"}`}>{a.code}</p>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama</label>
                {canManage ? (
                  <input
                    autoComplete="new-password"
                    name="name"
                    defaultValue={a.name}
                    required
                    disabled={!canManage}
                    className={`w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] bg-bg-base ${a.isHeader ? "font-bold text-ink" : "text-ink"}`}
                  />
                ) : (
                  <p className={`text-[11px] py-[6px] ${a.isHeader ? "font-bold text-ink" : "text-ink"}`}>{a.name}</p>
                )}
              </div>
              <div className="flex gap-1.5">
                <Badge variant="powder-blue">{ACCOUNT_TYPE_LABEL[a.accountType]}</Badge>
                <Badge variant={a.normalBalance === "debit" ? "sage" : "dusty-rose"}>{a.normalBalance === "debit" ? "Debit" : "Kredit"}</Badge>
              </div>
              <div>
                {a.isHeader ? (
                  <Badge variant="powder-blue">Header</Badge>
                ) : (
                  <Badge variant="sage">Posting</Badge>
                )}
              </div>
              {canManage ? (
                <div className="flex items-end gap-2">
                  <select name="isActive" defaultValue={String(a.isActive)} className="border border-ink-muted/12 rounded-lg px-2 py-1.5 text-[11px] text-ink bg-bg-base">
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </select>
                  <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                    Simpan
                  </button>
                </div>
              ) : (
                <Badge variant={a.isActive ? "sage" : "destructive"}>{a.isActive ? "Aktif" : "Nonaktif"}</Badge>
              )}
            </form>
            {canManage && (
              <form action={deleteChartOfAccount} className="mt-1.5">
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="accountId" value={a.id} />
                <button type="submit" className="text-destructive hover:underline text-xs">
                  Hapus Akun
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
