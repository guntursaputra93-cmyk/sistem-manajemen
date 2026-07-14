import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, hppProjectCosts, contracts, organizations, chartOfAccounts, journalEntries } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createProjectCost } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

export default async function HppProjectCostsPage({
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

  if (!hasPermission(session.user.role, "VIEW_HPP_PROJECT_COSTS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_HPP_PROJECT_COSTS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [costList, contractList, orgList, hppAccounts, postingAccounts, entryList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(hppProjectCosts).where(eq(hppProjectCosts.companyId, company.id)).orderBy(desc(hppProjectCosts.costDate), desc(hppProjectCosts.createdAt))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(eq(contracts.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id))),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.accountType, "hpp"), eq(chartOfAccounts.isHeader, false)))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false)))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(journalEntries).where(eq(journalEntries.companyId, company.id))),
  ]);

  const orgNameByContractId = new Map(contractList.map((c) => [c.id, orgList.find((o) => o.id === c.organizationId)?.name ?? "-"]));
  const accountLabelById = new Map(postingAccounts.map((a) => [a.id, `${a.code} · ${a.name}`]));
  const entryNumberById = new Map(entryList.map((e) => [e.id, e.entryNumber]));

  const columns: DataTableColumn<(typeof costList)[number]>[] = [
    { key: "date", header: "Tanggal", render: (c) => new Date(c.costDate).toLocaleDateString("id-ID") },
    { key: "client", header: "Klien / Kontrak", render: (c) => orgNameByContractId.get(c.contractId) ?? "-" },
    { key: "hppAccount", header: "Akun HPP", render: (c) => accountLabelById.get(c.hppAccountId) ?? "-" },
    { key: "offsetAccount", header: "Akun Lawan", render: (c) => accountLabelById.get(c.offsetAccountId) ?? "-" },
    { key: "description", header: "Keterangan", render: (c) => c.description ?? "-" },
    { key: "amount", header: "Nominal", render: (c) => formatRupiah(c.amount), className: "text-right" },
    { key: "journal", header: "No. Jurnal", render: (c) => entryNumberById.get(c.journalEntryId) ?? "-" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Biaya Langsung Proyek (HPP)</h1>
        <p className="text-sm text-ink-muted mt-1">Pencatatan biaya per kontrak {company.name} — tiap baris otomatis membuat jurnal.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canManage && (
        <Card
          title="Catat Biaya Proyek"
          description="Akun Lawan bisa akun bank/kas (kalau dibayar langsung) atau akun kewajiban (kalau masih terutang)."
        >
          {contractList.length === 0 ? (
            <p className="text-xs text-ink-muted">Belum ada kontrak di CRM untuk company ini.</p>
          ) : hppAccounts.length === 0 ? (
            <p className="text-xs text-ink-muted">Belum ada akun HPP posting di Chart of Accounts.</p>
          ) : (
            <form action={createProjectCost} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontrak</label>
                <select name="contractId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {contractList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {orgNameByContractId.get(c.id)} · {formatRupiah(c.contractValue)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Biaya</label>
                <input autoComplete="off" name="costDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun HPP (Debit)</label>
                <select name="hppAccountId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {hppAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Akun Lawan (Kredit)</label>
                <select name="offsetAccountId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                  {postingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nominal</label>
                <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" required placeholder="0" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Keterangan</label>
                <input autoComplete="off" name="description" placeholder="mis. Honor auditor - audit lapangan" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
              </div>
              <div className="lg:col-span-3">
                <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                  Catat Biaya
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <DataTable columns={columns} rows={costList} rowKey={(c) => c.id} emptyMessage="Belum ada biaya proyek tercatat." />

      <p className="text-xs text-ink-muted">
        Lihat margin per kontrak di{" "}
        <Link href={`/${companySlug}/keuangan/margin-proyek`} className="text-sage-deep hover:underline">
          laporan Margin Proyek
        </Link>
        .
      </p>
    </div>
  );
}
