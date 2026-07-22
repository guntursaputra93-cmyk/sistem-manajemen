import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, apBills, apPayments, chartOfAccounts, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { refreshOverdueBillStatuses } from "@/lib/finance/ap";
import { createBill } from "./actions";
import { formatRupiah as formatMoney } from "@/lib/finance/format";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  belum_dibayar: "Belum Dibayar",
  sebagian: "Sebagian",
  lunas: "Lunas",
  jatuh_tempo: "Jatuh Tempo",
};
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  draft: "powder-blue",
  belum_dibayar: "dusty-rose",
  sebagian: "powder-blue",
  lunas: "sage",
  jatuh_tempo: "destructive",
};

export default async function HutangPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; rekanan?: string; error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { q, status, rekanan, error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_AP_BILLS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_AP_BILLS");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  // Tidak ada cron di sistem ini — status jatuh tempo disegarkan saat halaman dibuka
  // (pola sama dengan daftar invoice AR).
  await withTenantContext(tenantContext, (tx) => refreshOverdueBillStatuses(tx, { companyId: company.id }));

  type BillStatus = "draft" | "belum_dibayar" | "sebagian" | "lunas" | "jatuh_tempo";
  const statusFilter: BillStatus[] =
    status === "draft" || status === "belum_dibayar" || status === "sebagian" || status === "lunas" || status === "jatuh_tempo"
      ? [status]
      : ["draft", "belum_dibayar", "sebagian", "jatuh_tempo"]; // default: yang belum tuntas

  const [bills, paidAgg, suppliers, expenseAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ bill: apBills, orgName: organizations.name, account: chartOfAccounts })
        .from(apBills)
        .innerJoin(organizations, eq(organizations.id, apBills.organizationId))
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, apBills.expenseAccountId))
        .where(
          and(
            eq(apBills.companyId, company.id),
            inArray(apBills.status, statusFilter),
            ...(rekanan ? [eq(apBills.organizationId, rekanan)] : [])
          )
        )
        .orderBy(asc(apBills.dueDate), desc(apBills.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ billId: apPayments.billId, paid: sql<string>`sum(${apPayments.amount})` })
        .from(apPayments)
        .where(eq(apPayments.companyId, company.id))
        .groupBy(apPayments.billId)
    ),
    // Hanya rekanan bertipe pemasok/keduanya yang boleh jadi lawan tagihan.
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(
          and(
            eq(organizations.companyId, company.id),
            or(eq(organizations.partnerType, "pemasok"), eq(organizations.partnerType, "keduanya"))
          )
        )
        .orderBy(asc(organizations.name))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.companyId, company.id),
            eq(chartOfAccounts.isHeader, false),
            eq(chartOfAccounts.isActive, true),
            inArray(chartOfAccounts.accountType, ["biaya", "hpp", "aset"])
          )
        )
        .orderBy(asc(chartOfAccounts.code))
    ),
  ]);

  const paidByBill = new Map(paidAgg.map((p) => [p.billId, Number(p.paid)]));
  const needle = q?.trim().toLowerCase();
  const rows = bills
    .map((b) => {
      const paid = paidByBill.get(b.bill.id) ?? 0;
      return { ...b, paid, remaining: Number(b.bill.amount) - paid };
    })
    .filter((r) =>
      needle ? `${r.orgName} ${r.bill.billNumber ?? ""} ${r.bill.supplierRef ?? ""} ${r.bill.description ?? ""}`.toLowerCase().includes(needle) : true
    );

  const totalOutstanding = rows.filter((r) => r.bill.status !== "lunas").reduce((s, r) => s + r.remaining, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Hutang (AP)" }]}
        title="Hutang (AP)"
        description={`Tagihan dari pemasok — total belum terbayar ${formatMoney(totalOutstanding)}.`}
        actions={
          canManage &&
          suppliers.length > 0 && (
            <FormDrawer
              buttonLabel="Tambah Tagihan"
              title="Tambah Tagihan Pemasok"
              description="Tagihan dibuat sebagai draft — nomor & jurnalnya baru dibuat saat diposting."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>
              )}
              <form action={createBill}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Detail Tagihan">
                  <FormField label="Pemasok *" full>
                    <select name="organizationId" required className={inputClass}>
                      <option value="">— pilih pemasok —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="No. Faktur Pemasok" optional>
                    <input autoComplete="off" name="supplierRef" placeholder="mis. FKT-2026-001" className={inputClass} />
                  </FormField>
                  <FormField label="Nominal *">
                    <input autoComplete="off" name="amount" inputMode="decimal" required placeholder="0" className={inputClass} />
                  </FormField>
                  <FormField label="Tanggal Tagihan *">
                    <input name="billDate" type="date" required defaultValue={today} className={inputClass} />
                  </FormField>
                  <FormField label="Jatuh Tempo *">
                    <input name="dueDate" type="date" required defaultValue={today} className={inputClass} />
                  </FormField>
                  <FormField label="Akun Beban / Aset *" full hint="Akun yang didebit saat tagihan diposting (lawan dari Utang Usaha).">
                    <select name="expenseAccountId" required className={inputClass}>
                      <option value="">— pilih akun —</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Keterangan" optional full>
                    <input autoComplete="off" name="description" placeholder="mis. jasa kalibrasi alat" className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Draft Tagihan" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {error && !canManage && <div className="bg-destructive/10 border border-destructive/30 text-ink text-[13px] rounded-lg px-4 py-3">{error}</div>}

      {canManage && suppliers.length === 0 && (
        <div className="rounded-lg border border-powder-blue/40 bg-powder-blue/10 px-4 py-3 text-[13px] text-ink">
          Belum ada rekanan bertipe <span className="font-semibold">Pemasok</span>. Tambahkan dulu di{" "}
          <Link href={`/${companySlug}/crm/organisasi`} className="text-sage-deep hover:underline">CRM → Organisasi</Link>{" "}
          (pilih Tipe Rekanan = Pemasok) sebelum membuat tagihan.
        </div>
      )}

      <ListToolbar
        searchPlaceholder="Cari pemasok / no. faktur / keterangan…"
        filters={[
          {
            name: "status",
            allLabel: "Belum Tuntas",
            options: [
              { value: "draft", label: "Draft" },
              { value: "belum_dibayar", label: "Belum Dibayar" },
              { value: "sebagian", label: "Sebagian" },
              { value: "jatuh_tempo", label: "Jatuh Tempo" },
              { value: "lunas", label: "Lunas" },
            ],
          },
          { name: "rekanan", allLabel: "Semua Pemasok", options: suppliers.map((s) => ({ value: s.id, label: s.name })) },
        ]}
        countLabel={`${rows.length} tagihan`}
      />

      {rows.length === 0 ? (
        <EmptyState message="Tidak ada tagihan yang cocok. Tambahkan tagihan pemasok, atau ubah filter status." />
      ) : (
        <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
              <tr>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tl-[14px]">Pemasok / Faktur</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Akun Beban</th>
                <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12">Nilai / Sisa</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Status</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Jatuh Tempo</th>
                <th className="sticky right-0 z-10 bg-[#FAF1E5] text-right px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tr-[14px]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.bill.status === "jatuh_tempo";
                return (
                  <tr key={r.bill.id} className={`border-t border-ink-muted/8 first:border-t-0 transition-colors ${overdue ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-sage/10"}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.orgName}</div>
                      <div className="text-[11px] text-ink-muted">
                        {r.bill.billNumber ?? "(draft)"}{r.bill.supplierRef ? ` · ${r.bill.supplierRef}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.account.code} · {r.account.name}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatMoney(r.bill.amount)}
                      {r.bill.status !== "draft" && <span className="block text-[11px] text-ink-muted">sisa {formatMoney(r.remaining)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[r.bill.status] ?? "powder-blue"}>{STATUS_LABEL[r.bill.status] ?? r.bill.status}</Badge>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap ${overdue ? "font-semibold text-destructive" : "text-ink-muted"}`}>
                      {new Date(r.bill.dueDate).toLocaleDateString("id-ID")}
                    </td>
                    <td className={`sticky right-0 z-10 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_10px_-8px_rgba(59,51,44,0.18)] ${overdue ? "bg-[#FDF3F1]" : "bg-surface"}`}>
                      <Link href={`/${companySlug}/keuangan/hutang/${r.bill.id}`} className="text-[13px] font-semibold text-sage-deep hover:underline">
                        {r.bill.status === "draft" ? "Posting" : r.bill.status === "lunas" ? "Lihat" : "Bayar"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
