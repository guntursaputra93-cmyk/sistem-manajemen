import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getBankReconciliationSummary, BankReconciliationError } from "@/lib/finance/bankReconciliation";
import { setStatementEndingBalanceAction, setItemClearedAction, completeBankReconciliationAction } from "../actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const MONTH_LABEL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function BankReconciliationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_BANK_RECONCILIATIONS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_BANK_RECONCILIATIONS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  let summary;
  try {
    summary = await withTenantContext(tenantContext, (tx) => getBankReconciliationSummary(tx, { companyId: company.id, reconciliationId: id }));
  } catch (err) {
    if (err instanceof BankReconciliationError) notFound();
    throw err;
  }

  const { reconciliation, account, items, openingBalance, clearedBalance, selisih } = summary;
  const isDraft = reconciliation.status === "draft";
  const isBalanced = selisih !== null && Math.abs(selisih) < 0.005;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">
            {account.code} · {account.name} — {MONTH_LABEL[reconciliation.periodMonth - 1]} {reconciliation.periodYear}
          </h1>
          <p className="text-sm text-ink-muted mt-1">{company.name}</p>
        </div>
        <Link href={`/${companySlug}/keuangan/rekonsiliasi-bank`} className="text-xs text-sage-deep hover:underline">
          &larr; Kembali ke daftar rekonsiliasi
        </Link>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Ringkasan">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
          <div>
            <p className="text-ink-muted">Status</p>
            <Badge variant={reconciliation.status === "selesai" ? "sage" : "powder-blue"}>{reconciliation.status === "selesai" ? "Selesai" : "Draft"}</Badge>
          </div>
          <div>
            <p className="text-ink-muted">Saldo Awal Periode</p>
            <p className="font-semibold text-ink">{formatRupiah(openingBalance)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Book Balance (akhir periode)</p>
            <p className="font-semibold text-ink">{formatRupiah(reconciliation.bookBalance)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Saldo Ter-cleared</p>
            <p className="font-semibold text-ink">{formatRupiah(clearedBalance)}</p>
          </div>
        </div>
      </Card>

      <Card title="Saldo Rekening Koran" description="Wajib diisi sebelum rekonsiliasi bisa diselesaikan.">
        {isDraft && canManage ? (
          <form action={setStatementEndingBalanceAction} className="flex items-end gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="reconciliationId" value={reconciliation.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Statement Ending Balance</label>
              <input
                autoComplete="off"
                name="statementEndingBalance"
                type="number"
                step="0.01"
                required
                defaultValue={reconciliation.statementEndingBalance ?? ""}
                className="w-48 border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
              Simpan
            </button>
          </form>
        ) : (
          <p className="text-[11px] text-ink">{reconciliation.statementEndingBalance !== null ? formatRupiah(reconciliation.statementEndingBalance) : "-"}</p>
        )}

        {selisih !== null && (
          <p className={`text-[11px] mt-3 font-semibold ${isBalanced ? "text-sage-deep" : "text-destructive"}`}>
            Selisih (Statement − Saldo Ter-cleared): {formatRupiah(selisih)} {isBalanced ? "(cocok)" : "(belum cocok — periksa item yang belum cleared)"}
          </p>
        )}
      </Card>

      <Card title="Item Mutasi" description="Tandai item yang sudah muncul di rekening koran (cleared). Item yang belum cleared wajib diberi catatan sebelum rekonsiliasi bisa diselesaikan.">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-sage-deep text-[10px] uppercase tracking-wide bg-sage/[0.18]">
              <tr>
                <th className="text-left px-3 py-[7px] font-bold">Tanggal</th>
                <th className="text-left px-3 py-[7px] font-bold">No. Jurnal</th>
                <th className="text-left px-3 py-[7px] font-bold">Keterangan</th>
                <th className="text-right px-3 py-[7px] font-bold">Debit</th>
                <th className="text-right px-3 py-[7px] font-bold">Kredit</th>
                <th className="text-left px-3 py-[7px] font-bold">Cleared?</th>
                <th className="text-left px-3 py-[7px] font-bold">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-muted italic">
                    Tidak ada mutasi posted pada periode ini.
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.item.id} className="border-t border-ink-muted/10">
                  <td className="px-3 py-[7px] text-ink">{row.entry ? new Date(row.entry.entryDate).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="px-3 py-[7px] text-ink">{row.entry?.entryNumber ?? "-"}</td>
                  <td className="px-3 py-[7px] text-ink">{row.line?.description ?? row.entry?.description ?? "-"}</td>
                  <td className="px-3 py-[7px] text-right text-ink">{row.line && Number(row.line.debitAmount) > 0 ? formatRupiah(row.line.debitAmount) : "-"}</td>
                  <td className="px-3 py-[7px] text-right text-ink">{row.line && Number(row.line.creditAmount) > 0 ? formatRupiah(row.line.creditAmount) : "-"}</td>
                  {isDraft && canManage ? (
                    <>
                      <td className="px-3 py-[7px]" colSpan={2}>
                        <form action={setItemClearedAction} className="flex items-center gap-2">
                          <input type="hidden" name="companySlug" value={companySlug} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="reconciliationId" value={reconciliation.id} />
                          <input type="hidden" name="itemId" value={row.item.id} />
                          <select name="isCleared" defaultValue={String(row.item.isCleared)} className="border border-ink-muted/12 rounded-lg px-1.5 py-1 text-[10px] text-ink bg-bg-base">
                            <option value="true">Cleared</option>
                            <option value="false">Belum</option>
                          </select>
                          <input
                            autoComplete="off"
                            name="notes"
                            defaultValue={row.item.notes ?? ""}
                            placeholder="Catatan (kalau belum cleared)"
                            className="border border-ink-muted/12 rounded-lg px-1.5 py-1 text-[10px] text-ink bg-bg-base w-40"
                          />
                          <button type="submit" className="text-sage-deep hover:underline text-[10px] font-semibold whitespace-nowrap">
                            Simpan
                          </button>
                        </form>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-[7px]">
                        <Badge variant={row.item.isCleared ? "sage" : "powder-blue"}>{row.item.isCleared ? "Cleared" : "Belum"}</Badge>
                      </td>
                      <td className="px-3 py-[7px] text-ink-muted">{row.item.notes ?? "-"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isDraft && canManage && (
        <Card title="Selesaikan Rekonsiliasi" description="Hanya bisa dilakukan kalau saldo rekening koran sudah diisi dan semua item sudah cleared atau punya catatan.">
          <form action={completeBankReconciliationAction}>
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="reconciliationId" value={reconciliation.id} />
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Selesaikan Rekonsiliasi
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
