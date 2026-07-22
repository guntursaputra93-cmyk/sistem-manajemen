import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalEntries, chartOfAccounts, openItems, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { formatRupiah as formatMoney } from "@/lib/finance/format";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", posted: "Posted", void: "Void" };
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose" | "destructive"> = {
  draft: "powder-blue",
  posted: "sage",
  void: "destructive",
};

const OPEN_ITEM_TYPE_LABEL: Record<string, string> = { uang_muka: "Uang Muka", dp_diterima: "DP Diterima", lainnya: "Lainnya" };

const ghostLinkClass =
  "inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 bg-transparent px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5";
const primaryLinkClass =
  "inline-flex items-center gap-1.5 rounded-[10px] bg-sage-deep px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90 shadow-[0_3px_10px_rgba(74,103,65,0.25)]";

export default async function JournalEntriesPage({
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

  if (!hasPermission(session.user.role, "VIEW_JOURNAL_ENTRIES")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const entryList = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(journalEntries).where(eq(journalEntries.companyId, company.id)).orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
  );

  // ===== Panel "Transaksi Terbuka" — jurnal PEMBUKA yang sudah diposting tapi
  // transaksinya belum tuntas (uang muka menunggu pertanggungjawaban, DP menunggu
  // pelunasan). Ini yang perlu tindak lanjut — BUKAN draft akuntansi. =====
  const openList = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ item: openItems, control: chartOfAccounts, opening: journalEntries, orgName: organizations.name })
      .from(openItems)
      .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, openItems.controlAccountId))
      .innerJoin(journalEntries, eq(journalEntries.id, openItems.openingEntryId))
      .leftJoin(organizations, eq(organizations.id, openItems.organizationId))
      .where(and(eq(openItems.companyId, company.id), inArray(openItems.status, ["terbuka", "sebagian"])))
      .orderBy(asc(openItems.dueDate), asc(openItems.createdAt))
  );

  const now = new Date();
  const openRows = openList.map((r) => {
    const remaining = Number(r.item.openingAmount) - Number(r.item.settledAmount);
    const ageDays = Math.floor((now.getTime() - new Date(r.item.createdAt).getTime()) / 86400000);
    const overdue = r.item.dueDate ? new Date(r.item.dueDate).getTime() < now.getTime() : false;
    return { ...r, remaining, ageDays, overdue };
  });

  const columns: DataTableColumn<(typeof entryList)[number]>[] = [
    {
      key: "number",
      header: "Nomor",
      render: (e) => (
        <Link href={`/${companySlug}/keuangan/jurnal/${e.id}`} className="font-medium text-sage-deep hover:underline">
          {e.entryNumber ?? "(draft)"}
        </Link>
      ),
    },
    { key: "date", header: "Tanggal", render: (e) => new Date(e.entryDate).toLocaleDateString("id-ID") },
    { key: "description", header: "Keterangan", render: (e) => e.description },
    { key: "status", header: "Status", render: (e) => <Badge variant={STATUS_VARIANT[e.status] ?? "powder-blue"}>{STATUS_LABEL[e.status] ?? e.status}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Jurnal Umum" }]}
        title="Jurnal Umum"
        description={`Riwayat jurnal ${company.name}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${companySlug}/keuangan/jurnal/template`} className={ghostLinkClass}>
              Template
            </Link>
            {canManage && (
              <Link href={`/${companySlug}/keuangan/jurnal/cepat`} className={ghostLinkClass}>
                Jurnal Cepat
              </Link>
            )}
            {canManage && (
              <Link href={`/${companySlug}/keuangan/jurnal/baru`} className={primaryLinkClass}>
                Buat Jurnal
              </Link>
            )}
          </div>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-[13px] rounded-lg px-4 py-3">{error}</div>}

      {openRows.length > 0 && (
        <Card
          title="Transaksi Terbuka — perlu diselesaikan"
          description={`${openRows.length} transaksi belum tuntas (uang muka menunggu pertanggungjawaban / DP menunggu pelunasan).`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
                <tr>
                  <th className="text-left px-4 py-[10px] font-bold">Jenis</th>
                  <th className="text-left px-4 py-[10px] font-bold">Pihak / Rekanan</th>
                  <th className="text-left px-4 py-[10px] font-bold">Akun Kontrol</th>
                  <th className="text-right px-4 py-[10px] font-bold">Nilai / Sisa</th>
                  <th className="text-left px-4 py-[10px] font-bold">Status</th>
                  <th className="text-left px-4 py-[10px] font-bold">Umur / Jatuh Tempo</th>
                  {canManage && <th className="sticky right-0 z-10 bg-[#FAF1E5] text-right px-4 py-[10px] font-bold">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {openRows.map((r) => (
                  <tr key={r.item.id} className={`border-t border-ink-muted/8 first:border-t-0 transition-colors ${r.overdue ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-sage/10"}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={r.item.type === "dp_diterima" ? "dusty-rose" : "powder-blue"}>{OPEN_ITEM_TYPE_LABEL[r.item.type] ?? r.item.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{r.orgName ?? r.item.description}</div>
                      {r.orgName && r.item.description !== r.orgName && (
                        <div className="text-[11px] text-ink-muted">{r.item.description}</div>
                      )}
                      <Link href={`/${companySlug}/keuangan/jurnal/${r.opening.id}`} className="text-[11px] text-sage-deep hover:underline">
                        {r.opening.entryNumber ?? "(jurnal pembuka)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.control.code} · {r.control.name}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatMoney(r.item.openingAmount)}
                      <span className="block text-[11px] text-ink-muted">sisa {formatMoney(r.remaining)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.item.status === "sebagian" ? <Badge variant="powder-blue">Sebagian</Badge> : <Badge variant="dusty-rose">Terbuka</Badge>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={r.ageDays > 30 ? "font-semibold text-destructive" : "text-ink-muted"}>{r.ageDays === 0 ? "hari ini" : `${r.ageDays} hari`}</span>
                      {r.item.dueDate && (
                        <span className={`block text-[11px] ${r.overdue ? "font-semibold text-destructive" : "text-ink-muted"}`}>
                          j.t. {new Date(r.item.dueDate).toLocaleDateString("id-ID")}{r.overdue ? " (lewat)" : ""}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className={`sticky right-0 z-10 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_10px_-8px_rgba(59,51,44,0.18)] ${r.overdue ? "bg-[#FDF3F1]" : "bg-surface"}`}>
                        <Link
                          href={`/${companySlug}/keuangan/jurnal/transaksi-terbuka/${r.item.id}`}
                          className="inline-flex rounded-[9px] bg-sage-deep px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-sage-deep/90"
                        >
                          Selesaikan
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DataTable columns={columns} rows={entryList} rowKey={(e) => e.id} emptyMessage="Belum ada jurnal." />
    </div>
  );
}
