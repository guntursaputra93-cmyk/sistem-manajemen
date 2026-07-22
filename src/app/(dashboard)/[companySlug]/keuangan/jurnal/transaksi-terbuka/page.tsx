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
import { PageHeader } from "@/components/ui/PageHeader";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { EmptyState } from "@/components/ui/EmptyState";

const TYPE_LABEL: Record<string, string> = { uang_muka: "Uang Muka", dp_diterima: "DP Diterima", lainnya: "Lainnya" };
const STATUS_LABEL: Record<string, string> = { terbuka: "Terbuka", sebagian: "Sebagian", selesai: "Selesai" };
const STATUS_VARIANT: Record<string, "sage" | "powder-blue" | "dusty-rose"> = { terbuka: "dusty-rose", sebagian: "powder-blue", selesai: "sage" };

export default async function OpenItemsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ q?: string; status?: string; rekanan?: string }>;
}) {
  const { companySlug } = await params;
  const { q, status, rekanan } = await searchParams;
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

  // Tanpa filter status = tampilkan yang masih perlu tindak lanjut (terbuka + sebagian).
  const statusFilter: ("terbuka" | "sebagian" | "selesai")[] =
    status === "terbuka" || status === "sebagian" || status === "selesai" ? [status] : ["terbuka", "sebagian"];

  const [rows, orgList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ item: openItems, control: chartOfAccounts, opening: journalEntries, orgName: organizations.name })
        .from(openItems)
        .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, openItems.controlAccountId))
        .innerJoin(journalEntries, eq(journalEntries.id, openItems.openingEntryId))
        .leftJoin(organizations, eq(organizations.id, openItems.organizationId))
        .where(
          and(
            eq(openItems.companyId, company.id),
            inArray(openItems.status, statusFilter),
            ...(rekanan ? [eq(openItems.organizationId, rekanan)] : [])
          )
        )
        .orderBy(asc(openItems.dueDate), desc(openItems.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.companyId, company.id))
        .orderBy(asc(organizations.name))
    ),
  ]);

  const needle = q?.trim().toLowerCase();
  const now = new Date();
  const items = rows
    .filter((r) => {
      if (!needle) return true;
      return `${r.item.description} ${r.orgName ?? ""} ${r.control.code} ${r.control.name}`.toLowerCase().includes(needle);
    })
    .map((r) => {
      const remaining = Number(r.item.openingAmount) - Number(r.item.settledAmount);
      const ageDays = Math.floor((now.getTime() - new Date(r.item.createdAt).getTime()) / 86400000);
      const overdue = r.item.status !== "selesai" && r.item.dueDate ? new Date(r.item.dueDate).getTime() < now.getTime() : false;
      return { ...r, remaining, ageDays, overdue };
    });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum", href: `/${companySlug}/keuangan/jurnal` },
          { label: "Transaksi Terbuka" },
        ]}
        title="Transaksi Terbuka"
        description="Uang muka menunggu pertanggungjawaban & DP menunggu pelunasan — transaksi yang perlu tindak lanjut penyelesaian."
      />

      <ListToolbar
        searchPlaceholder="Cari pihak / rekanan / akun kontrol…"
        filters={[
          {
            name: "status",
            allLabel: "Aktif (terbuka + sebagian)",
            options: [
              { value: "terbuka", label: "Terbuka" },
              { value: "sebagian", label: "Sebagian" },
              { value: "selesai", label: "Selesai" },
            ],
          },
          {
            name: "rekanan",
            allLabel: "Semua Rekanan",
            options: orgList.map((o) => ({ value: o.id, label: o.name })),
          },
        ]}
        countLabel={`${items.length} transaksi`}
      />

      {items.length === 0 ? (
        <EmptyState message="Tidak ada transaksi terbuka. Buat jurnal pembuka (mis. uang muka / DP) dan centang 'perlu penyelesaian' untuk menampilkannya di sini." />
      ) : (
        <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
              <tr>
                <th className="text-left px-4 py-[11px] font-bold">Jenis</th>
                <th className="text-left px-4 py-[11px] font-bold">Pihak / Rekanan</th>
                <th className="text-left px-4 py-[11px] font-bold">Akun Kontrol</th>
                <th className="text-right px-4 py-[11px] font-bold">Nilai / Sisa</th>
                <th className="text-left px-4 py-[11px] font-bold">Status</th>
                <th className="text-left px-4 py-[11px] font-bold">Umur / Jatuh Tempo</th>
                {/* Kolom aksi dipatok di kanan supaya tombol "Selesaikan" tetap terlihat
                    walau tabel perlu digeser horizontal di layar sempit. */}
                <th className="sticky right-0 z-10 bg-[#FAF1E5] text-right px-4 py-[11px] font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.item.id} className={`border-t border-ink-muted/8 first:border-t-0 transition-colors ${r.overdue ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-sage/10"}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant={r.item.type === "dp_diterima" ? "dusty-rose" : "powder-blue"}>{TYPE_LABEL[r.item.type] ?? r.item.type}</Badge>
                  </td>
                  {/* Rekanan jadi baris utama; keterangan hanya ditampilkan kalau memang
                      berbeda (kalau user cuma pilih rekanan, keterangan = nama rekanan
                      sehingga tidak perlu diulang). */}
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
                    <Badge variant={STATUS_VARIANT[r.item.status] ?? "powder-blue"}>{STATUS_LABEL[r.item.status] ?? r.item.status}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={r.ageDays > 30 && r.item.status !== "selesai" ? "font-semibold text-destructive" : "text-ink-muted"}>
                      {r.ageDays === 0 ? "hari ini" : `${r.ageDays} hari`}
                    </span>
                    {r.item.dueDate && (
                      <span className={`block text-[11px] ${r.overdue ? "font-semibold text-destructive" : "text-ink-muted"}`}>
                        j.t. {new Date(r.item.dueDate).toLocaleDateString("id-ID")}{r.overdue ? " (lewat)" : ""}
                      </span>
                    )}
                  </td>
                  <td className={`sticky right-0 z-10 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_10px_-8px_rgba(59,51,44,0.18)] ${r.overdue ? "bg-[#FDF3F1]" : "bg-surface"}`}>
                    <Link
                      href={`/${companySlug}/keuangan/jurnal/transaksi-terbuka/${r.item.id}`}
                      className={
                        r.item.status === "selesai" || !canManage
                          ? "text-[13px] font-semibold text-sage-deep hover:underline"
                          : "inline-flex rounded-[9px] bg-sage-deep px-3 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-sage-deep/90"
                      }
                    >
                      {r.item.status === "selesai" || !canManage ? "Lihat" : "Selesaikan"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
