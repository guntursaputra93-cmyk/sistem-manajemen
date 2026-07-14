import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getBudgetRealization } from "@/lib/finance/rkapReport";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatPercent(v: number | null): string {
  if (v === null) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/**
 * "Baik" (hijau) tidak sama arahnya utk semua tipe akun — aktual pendapatan MELEBIHI
 * anggaran itu bagus (varians positif = baik), sedangkan aktual HPP/biaya MELEBIHI
 * anggaran itu buruk (varians positif = buruk, kebalikan dari pendapatan). Tanpa
 * pembedaan ini, akun pendapatan yang tumbuh di atas target akan salah ditandai
 * merah/"melebihi anggaran" padahal itu kabar baik.
 */
function isFavorable(accountType: string, varianceAmount: number): boolean {
  return accountType === "pendapatan" ? varianceAmount >= 0 : varianceAmount <= 0;
}

export default async function RkapRealizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_RKAP_BUDGETS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const { year: yearParam } = await searchParams;
  const year = Number(yearParam) || new Date().getFullYear();

  const rows = await withTenantContext(tenantContext, (tx) => getBudgetRealization(tx, { companyId: company.id, year }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">Realisasi vs Anggaran</h1>
          <p className="text-sm text-ink-muted mt-1">{company.name} — tahun {year}, aktual dari jurnal berstatus posted.</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input autoComplete="off" name="year" type="number" defaultValue={year} className="w-24 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
          <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
            Tampilkan
          </button>
        </form>
      </div>

      {rows.length === 0 && <Card title="Realisasi Anggaran">Belum ada anggaran untuk tahun {year}.</Card>}

      {rows.map((row) => (
        <Card
          key={row.budget.id}
          title={`${row.account.code} · ${row.account.name}`}
          description={`Anggaran ${formatRupiah(row.budget.budgetedAmount)} · Aktual ${formatRupiah(row.actualAmount)}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] mb-3">
            <div>
              <p className="text-ink-muted">Varians Nominal</p>
              <p className={`font-bold ${isFavorable(row.account.accountType, row.varianceAmount) ? "text-sage-deep" : "text-destructive"}`}>{formatRupiah(row.varianceAmount)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Varians Persen</p>
              <p className={`font-bold ${isFavorable(row.account.accountType, row.varianceAmount) ? "text-sage-deep" : "text-destructive"}`}>{formatPercent(row.variancePercent)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Status</p>
              <p className="font-bold text-ink">
                {row.account.accountType === "pendapatan"
                  ? row.varianceAmount >= 0
                    ? "Melebihi target"
                    : "Di bawah target"
                  : row.varianceAmount <= 0
                    ? "Dalam anggaran"
                    : "Melebihi anggaran"}
              </p>
            </div>
          </div>

          {row.monthly && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10.5px]">
                <thead className="text-sage-deep uppercase tracking-wide bg-sage/[0.18]">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-bold rounded-tl-lg">Bulan</th>
                    {MONTH_LABEL.map((m) => (
                      <th key={m} className="text-right px-2 py-1.5 font-bold">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-ink-muted/10">
                    <td className="px-2 py-1.5 text-ink-muted">Anggaran</td>
                    {row.monthly.map((m) => (
                      <td key={m.month} className="px-2 py-1.5 text-right text-ink">{formatRupiah(m.budgeted)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-ink-muted/10">
                    <td className="px-2 py-1.5 text-ink-muted">Aktual</td>
                    {row.monthly.map((m) => (
                      <td key={m.month} className="px-2 py-1.5 text-right text-ink">{formatRupiah(m.actual)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-ink-muted/10">
                    <td className="px-2 py-1.5 text-ink-muted">Varians</td>
                    {row.monthly.map((m) => (
                      <td key={m.month} className={`px-2 py-1.5 text-right font-semibold ${isFavorable(row.account.accountType, m.variance) ? "text-sage-deep" : "text-destructive"}`}>
                        {formatRupiah(m.variance)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
