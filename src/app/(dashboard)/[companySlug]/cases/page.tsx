import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, cases, organizations, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { parsePage, offsetFor, totalPages, PAGE_SIZE } from "@/lib/pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Pagination } from "@/components/Pagination";

// Kolom kanban per current_stage. 'cancelled' sengaja kolom terpisah paling kanan
// (bukan digabung filter) supaya case yang dibatalkan tetap terlihat di board.
const STAGE_COLUMNS: { key: string; label: string }[] = [
  { key: "intake", label: "Intake" },
  { key: "penawaran", label: "Penawaran" },
  { key: "kontrak", label: "Kontrak" },
  { key: "penugasan", label: "Penugasan" },
  { key: "pelaksanaan", label: "Pelaksanaan" },
  { key: "review", label: "Review" },
  { key: "delivery", label: "Delivery" },
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<string, string> = { aktif: "Aktif", on_hold: "On Hold", selesai: "Selesai", batal: "Batal" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { aktif: "sage", on_hold: "powder-blue", selesai: "dusty-rose", batal: "destructive" };

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "powder-blue"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export default async function CaseBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ view?: string; q?: string; pic?: string; klien?: string; status?: string; page?: string }>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CASES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  // Modul belum aktif untuk company ini -> requireModuleEnabled redirect ke dashboard.
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "case_management", companySlug }));

  const [rawCases, orgList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          title: cases.title,
          currentStage: cases.currentStage,
          status: cases.status,
          organizationId: cases.organizationId,
          picUserId: cases.picUserId,
          createdBy: cases.createdBy,
          createdAt: cases.createdAt,
          organizationName: organizations.name,
          picUserName: users.fullName,
        })
        .from(cases)
        .leftJoin(organizations, eq(organizations.id, cases.organizationId))
        .leftJoin(users, eq(users.id, cases.picUserId))
        .where(eq(cases.companyId, company.id)),
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(asc(organizations.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))),
  ]);

  // Visibilitas per-baris (pola sama semangat getVisibleAssigneeIds CRM): staff hanya
  // case di mana ia PIC atau pembuatnya; role lain lihat semua case company.
  const scoped =
    session.user.role === "staff"
      ? rawCases.filter((c) => c.picUserId === session.user.id || c.createdBy === session.user.id)
      : rawCases;

  // Filter server-side dari ?q= / ?pic= / ?klien= / ?status= (di-set ListToolbar).
  const needle = sp.q?.trim().toLowerCase();
  const filtered = scoped
    .filter((c) => {
      if (needle) {
        const hay = `${c.caseNumber ?? ""} ${c.title} ${c.organizationName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (sp.pic && c.picUserId !== sp.pic) return false;
      if (sp.klien && c.organizationId !== sp.klien) return false;
      if (sp.status && c.status !== sp.status) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const view = sp.view === "table" ? "table" : "board";

  function viewHref(v: string): string {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.pic) p.set("pic", sp.pic);
    if (sp.klien) p.set("klien", sp.klien);
    if (sp.status) p.set("status", sp.status);
    p.set("view", v);
    return `/${companySlug}/cases?${p.toString()}`;
  }

  const canManage = hasPermission(session.user.role, "MANAGE_CASES");

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Case Management" }, { label: "Case Board" }]}
        title="Case Board"
        description={session.user.role === "staff" ? "Case yang kamu tangani." : `Semua case di ${company.name}.`}
        actions={
          canManage && (
            <Link
              href={`/${companySlug}/cases/baru`}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-peach-deep px-4 py-2 text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(185,92,46,0.32)] transition-colors hover:bg-peach-deep/90"
            >
              Case Baru
            </Link>
          )
        }
      />

      {scoped.length === 0 ? (
        <EmptyState
          message="Belum ada case. Case yang dibuat akan muncul di sini sebagai kartu di papan tahap."
          action={
            canManage ? (
              <Link href={`/${companySlug}/cases/baru`} className="text-[13px] font-semibold text-sage-deep hover:underline">
                Buat case pertama →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-4">
            <Tabs
              value={view}
              tabs={[
                { value: "board", label: "Papan", href: viewHref("board") },
                { value: "table", label: "Tabel", href: viewHref("table") },
              ]}
            />
          </div>

          <ListToolbar
            searchPlaceholder="Cari nomor case, judul, atau klien…"
            filters={[
              { name: "pic", allLabel: "Semua PIC", options: userList.map((u) => ({ value: u.id, label: u.fullName })) },
              { name: "klien", allLabel: "Semua Klien", options: orgList.map((o) => ({ value: o.id, label: o.name })) },
              { name: "status", allLabel: "Semua Status", options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
            ]}
            countLabel={`${filtered.length} case`}
          />

          {view === "board" ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {STAGE_COLUMNS.map((col) => {
                const colCases = filtered.filter((c) => c.currentStage === col.key);
                return (
                  <div key={col.key} className="flex w-[248px] shrink-0 flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-ink-muted">{col.label}</span>
                      <span className="rounded-full bg-ink-muted/10 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{colCases.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {colCases.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-ink-muted/15 px-3 py-4 text-center text-[11.5px] italic text-ink-muted/70">Kosong</p>
                      ) : (
                        colCases.map((c) => (
                          <Link
                            key={c.id}
                            href={`/${companySlug}/cases/${c.id}`}
                            className="block rounded-[12px] bg-surface px-3 py-2.5 shadow-[0_2px_10px_rgba(51,57,59,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(51,57,59,0.1)]"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="font-mono text-[10.5px] text-ink-muted">{c.caseNumber ?? "—"}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <p className="text-[13px] font-semibold leading-snug text-ink">{c.title}</p>
                            <p className="mt-1 truncate text-[11.5px] text-ink-muted">{c.organizationName ?? "-"}</p>
                            <p className="truncate text-[11px] text-ink-muted/80">PIC: {c.picUserName ?? "—"}</p>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (() => {
              const page = parsePage(sp.page);
              const pageRows = filtered.slice(offsetFor(page), offsetFor(page) + PAGE_SIZE);
              const columns: DataTableColumn<(typeof filtered)[number]>[] = [
                { key: "caseNumber", header: "Nomor", render: (c) => <span className="font-mono text-[12px] text-ink-muted">{c.caseNumber ?? "—"}</span> },
                {
                  key: "title",
                  header: "Judul",
                  render: (c) => (
                    <Link href={`/${companySlug}/cases/${c.id}`} className="font-semibold text-sage-deep hover:underline">
                      {c.title}
                    </Link>
                  ),
                },
                { key: "org", header: "Klien", render: (c) => c.organizationName ?? "-" },
                { key: "stage", header: "Tahap", render: (c) => STAGE_COLUMNS.find((s) => s.key === c.currentStage)?.label ?? c.currentStage },
                { key: "status", header: "Status", render: (c) => <StatusBadge status={c.status} /> },
                { key: "pic", header: "PIC", render: (c) => c.picUserName ?? "-" },
              ];
              return (
                <>
                  <DataTable
                    columns={columns}
                    rows={pageRows}
                    rowKey={(c) => c.id}
                    emptyMessage={needle || sp.pic || sp.klien || sp.status ? "Tidak ada case yang cocok dengan pencarian/filter." : "Belum ada case."}
                  />
                  <Pagination basePath={`/${companySlug}/cases`} searchParams={sp} pageParamName="page" currentPage={page} totalPages={totalPages(filtered.length)} />
                </>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}
