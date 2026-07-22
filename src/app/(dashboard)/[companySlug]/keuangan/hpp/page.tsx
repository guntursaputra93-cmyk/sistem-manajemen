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
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "HPP" }]}
        title="Biaya Langsung Proyek (HPP)"
        description={`Pencatatan biaya per kontrak ${company.name} — tiap baris otomatis membuat jurnal.`}
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Catat Biaya"
              title="Catat Biaya Proyek"
              description="Akun Lawan: bank/kas (dibayar langsung) atau kewajiban (masih terutang)."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {contractList.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Belum ada kontrak di CRM untuk company ini.</p>
              ) : hppAccounts.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Belum ada akun HPP posting di Chart of Accounts.</p>
              ) : (
                <form action={createProjectCost}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <FormSection title="① Kontrak & Tanggal">
                    <FormField label="Kontrak *" full>
                      <select name="contractId" required className={inputClass}>
                        {contractList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {orgNameByContractId.get(c.id)} · {formatRupiah(c.contractValue)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Tanggal Biaya *">
                      <input autoComplete="off" name="costDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
                    </FormField>
                    <FormField label="Nominal *">
                      <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" required placeholder="0" className={inputClass} />
                    </FormField>
                  </FormSection>
                  <FormSection title="② Akun & Keterangan">
                    <FormField label="Akun HPP (Debit) *" full>
                      <select name="hppAccountId" required className={inputClass}>
                        {hppAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Akun Lawan (Kredit) *" full>
                      <select name="offsetAccountId" required className={inputClass}>
                        {postingAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Keterangan" full>
                      <input autoComplete="off" name="description" placeholder="mis. Honor auditor - audit lapangan" className={inputClass} />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Catat Biaya" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

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
