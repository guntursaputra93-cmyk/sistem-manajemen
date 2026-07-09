import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import {
  companies,
  departments,
  users,
  documentCategories,
  documents,
  documentVersions,
  outgoingLetters,
} from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { canViewDocument, getUnreadDocumentCount } from "@/lib/documents/access";
import { isModuleEnabled } from "@/lib/modules";
import { queryCombinedSuratArchive } from "@/lib/letters/archive";
import { parsePage, offsetFor, totalPages, PAGE_SIZE } from "@/lib/pagination";
import { Pagination } from "@/components/Pagination";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { UnreadBadge } from "@/components/ui/UnreadBadge";
import { DatePicker } from "@/components/ui/DatePicker";

const DOC_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "Sedang Direview",
  active: "Aktif",
  superseded: "Digantikan",
  expired: "Kedaluwarsa",
};

const LETTER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

type SearchParams = Record<string, string | undefined>;

const TABS = [
  { key: "pp", label: "Peraturan Perusahaan", moduleKey: "pengendalian_dokumen" },
  { key: "sk", label: "SK Direktur", moduleKey: "pengendalian_dokumen" },
  { key: "nd", label: "Nota Dinas", moduleKey: "surat_masuk_keluar" },
  { key: "surat", label: "Surat Masuk-Keluar", moduleKey: "surat_masuk_keluar" },
] as const;

export default async function ArsipPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_DOCUMENTS") && !hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const [suratModuleOn, dokumenModuleOn] = await withTenantContext(tenantContext, (tx) =>
    Promise.all([
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar" }),
      isModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen" }),
    ])
  );
  const moduleOn: Record<string, boolean> = { surat_masuk_keluar: suratModuleOn, pengendalian_dokumen: dokumenModuleOn };
  const visibleTabs = TABS.filter((t) => moduleOn[t.moduleKey]);
  if (visibleTabs.length === 0) redirect(`/${companySlug}/dashboard`);

  const requestedTab = TABS.find((t) => t.key === sp.tab);
  const activeTab = requestedTab && moduleOn[requestedTab.moduleKey] ? requestedTab.key : visibleTabs[0].key;
  const basePath = `/${companySlug}/arsip`;

  const selfUser = await withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]);
  const viewer = { role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };

  // Badge notifikasi belum dibaca (spesifikasi Bagian 4) — cuma relevan utk 2
  // tab dokumen (PP/SK Direktur), nota dinas & surat tidak punya tracing baca.
  const [unreadPP, unreadSK] = await withTenantContext(tenantContext, (tx) =>
    Promise.all([
      getUnreadDocumentCount(tx, { companyId: company.id, hierarchyLevel: 1, userId: session.user.id, viewer }),
      getUnreadDocumentCount(tx, { companyId: company.id, hierarchyLevel: 2, userId: session.user.id, viewer }),
    ])
  );
  const unreadByTab: Record<string, number> = { pp: unreadPP, sk: unreadSK };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Arsip & Pencarian</h1>
        <p className="text-ink-muted text-sm mt-1">
          Tiap bagian punya halaman & filter sendiri — tidak digabung jadi 1 daftar panjang.
        </p>
      </div>

      <Tabs
        value={activeTab}
        tabs={visibleTabs.map((t) => ({
          value: t.key,
          label: t.label,
          href: `${basePath}?${new URLSearchParams({ tab: t.key }).toString()}`,
          badge: unreadByTab[t.key] ? <UnreadBadge count={unreadByTab[t.key]} /> : undefined,
        }))}
      />

      {activeTab === "pp" && <DocumentTab hierarchyLevel={1} tabKey="pp" label="Peraturan Perusahaan" companySlug={companySlug} company={company} sp={sp} tenantContext={tenantContext} session={session} basePath={basePath} />}
      {activeTab === "sk" && <DocumentTab hierarchyLevel={2} tabKey="sk" label="SK Direktur" companySlug={companySlug} company={company} sp={sp} tenantContext={tenantContext} session={session} basePath={basePath} />}
      {activeTab === "nd" && <NotaDinasTab companySlug={companySlug} company={company} sp={sp} tenantContext={tenantContext} basePath={basePath} />}
      {activeTab === "surat" && <SuratMasukKeluarTab companySlug={companySlug} company={company} sp={sp} tenantContext={tenantContext} basePath={basePath} />}
    </div>
  );
}

async function DocumentTab({
  hierarchyLevel,
  tabKey,
  label,
  companySlug,
  company,
  sp,
  tenantContext,
  session,
  basePath,
}: {
  hierarchyLevel: number;
  tabKey: "pp" | "sk";
  label: string;
  companySlug: string;
  company: typeof companies.$inferSelect;
  sp: SearchParams;
  tenantContext: { role: string; companyId: string };
  session: { user: { id: string; role: string; companyId: string } };
  basePath: string;
}) {
  const pageParam = `${tabKey}_page`;
  const statusParam = `${tabKey}_status`;
  const fromParam = `${tabKey}_from`;
  const toParam = `${tabKey}_to`;
  const page = parsePage(sp[pageParam]);
  const statusFilter = sp[statusParam] || null;
  const dateFrom = sp[fromParam] || null;
  const dateTo = sp[toParam] || null;

  const [categories, allDocs, allVersions, selfUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(documentCategories).where(and(eq(documentCategories.companyId, company.id), eq(documentCategories.hierarchyLevel, hierarchyLevel)))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(documents).where(eq(documents.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(documentVersions).where(eq(documentVersions.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
  ]);

  const categoryIds = new Set(categories.map((c) => c.id));
  const docsInLevel = allDocs.filter((d) => categoryIds.has(d.categoryId));

  function representativeVersion(documentId: string) {
    const vs = allVersions.filter((v) => v.documentId === documentId);
    return vs.find((v) => v.status === "active") ?? vs.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  const viewer = { role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };

  const visibleDocs = await withTenantContext(tenantContext, async (tx) => {
    const checks = await Promise.all(
      docsInLevel.map((d) => canViewDocument(tx, { companyId: company.id, documentId: d.id, categoryId: d.categoryId, viewer }))
    );
    return docsInLevel.filter((_, i) => checks[i]);
  });

  const filtered = visibleDocs.filter((d) => {
    const v = representativeVersion(d.id);
    if (statusFilter && v?.status !== statusFilter) return false;
    if (dateFrom && (!v?.effectiveDate || v.effectiveDate < dateFrom)) return false;
    if (dateTo && (!v?.effectiveDate || v.effectiveDate > dateTo)) return false;
    return true;
  });

  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = filtered.length;
  const pageRows = filtered.slice(offsetFor(page), offsetFor(page) + PAGE_SIZE);

  const columns: DataTableColumn<(typeof pageRows)[number]>[] = [
    {
      key: "judul",
      header: "Judul",
      render: (doc) => (
        <Link href={`/${companySlug}/dokumen/${doc.id}`} className="text-sage-deep hover:underline">
          {doc.title}
        </Link>
      ),
    },
    { key: "versi", header: "Versi", render: (doc) => (representativeVersion(doc.id) ? `v${representativeVersion(doc.id)!.versionNumber}` : "-") },
    {
      key: "status",
      header: "Status",
      render: (doc) => {
        const v = representativeVersion(doc.id);
        return v ? (DOC_STATUS_LABEL[v.status] ?? v.status) : "-";
      },
    },
    { key: "tanggal", header: "Tanggal Efektif", render: (doc) => representativeVersion(doc.id)?.effectiveDate ?? "-" },
  ];

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey={tabKey} showDepartment={false} statusOptions={DOC_STATUS_LABEL} />

      <DataTable columns={columns} rows={pageRows} rowKey={(doc) => doc.id} emptyMessage={`Tidak ada dokumen ${label.toLowerCase()}.`} />

      <Pagination basePath={basePath} searchParams={sp} pageParamName={pageParam} currentPage={page} totalPages={totalPages(total)} />
    </section>
  );
}

async function NotaDinasTab({
  companySlug,
  company,
  sp,
  tenantContext,
  basePath,
}: {
  companySlug: string;
  company: typeof companies.$inferSelect;
  sp: SearchParams;
  tenantContext: { role: string; companyId: string };
  basePath: string;
}) {
  const page = parsePage(sp.nd_page);
  const deptFilter = sp.nd_dept || null;
  const statusFilter = sp.nd_status || null;
  const dateFrom = sp.nd_from || null;
  const dateTo = sp.nd_to || null;

  const conditions = [eq(outgoingLetters.companyId, company.id), eq(outgoingLetters.letterCategory, "nota_dinas")];
  if (deptFilter) conditions.push(eq(outgoingLetters.departmentId, deptFilter));
  if (statusFilter) conditions.push(eq(outgoingLetters.status, statusFilter as (typeof outgoingLetters.status.enumValues)[number]));
  if (dateFrom) conditions.push(gte(outgoingLetters.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(outgoingLetters.createdAt, new Date(dateTo)));

  const [rows, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(outgoingLetters).where(and(...conditions)).orderBy(desc(outgoingLetters.createdAt)).limit(PAGE_SIZE).offset(offsetFor(page))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
  ]);

  const totalRows = await withTenantContext(tenantContext, (tx) => tx.select().from(outgoingLetters).where(and(...conditions)));

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "nomor",
      header: "No. Nota Dinas",
      render: (letter) => (
        <Link href={`/${companySlug}/surat-keluar/${letter.id}`} className="text-sage-deep hover:underline">
          {letter.letterNumber ?? "(draft)"}
        </Link>
      ),
    },
    { key: "perihal", header: "Perihal", render: (letter) => letter.subject },
    { key: "status", header: "Status", render: (letter) => LETTER_STATUS_LABEL[letter.status] ?? letter.status },
  ];

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey="nd" showDepartment departments={deptList} statusOptions={LETTER_STATUS_LABEL} />

      <DataTable columns={columns} rows={rows} rowKey={(letter) => letter.id} emptyMessage="Tidak ada nota dinas." />

      <Pagination basePath={basePath} searchParams={sp} pageParamName="nd_page" currentPage={page} totalPages={totalPages(totalRows.length)} />
    </section>
  );
}

async function SuratMasukKeluarTab({
  companySlug,
  company,
  sp,
  tenantContext,
  basePath,
}: {
  companySlug: string;
  company: typeof companies.$inferSelect;
  sp: SearchParams;
  tenantContext: { role: string; companyId: string };
  basePath: string;
}) {
  const page = parsePage(sp.surat_page);
  const deptFilter = sp.surat_dept || null;
  const jenisFilter = (sp.surat_jenis as "masuk" | "keluar" | undefined) || null;
  const dateFrom = sp.surat_from || null;
  const dateTo = sp.surat_to || null;

  const [{ rows, totalCount }, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      queryCombinedSuratArchive(tx, {
        companyId: company.id,
        departmentId: deptFilter,
        jenis: jenisFilter,
        dateFrom,
        dateTo,
        limit: PAGE_SIZE,
        offset: offsetFor(page),
      })
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
  ]);

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "arah", header: "Arah", render: (row) => (row.jenis === "masuk" ? "Masuk" : "Keluar") },
    { key: "tanggal", header: "Tanggal", render: (row) => row.tanggal },
    {
      key: "perihal",
      header: "Perihal",
      render: (row) => (
        <Link href={`/${companySlug}/${row.jenis === "masuk" ? "surat-masuk" : "surat-keluar"}/${row.id}`} className="text-sage-deep hover:underline">
          {row.subject}
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (row) => row.status },
  ];

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey="surat" showDepartment departments={deptList} showJenis />

      <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.jenis}-${row.id}`} emptyMessage="Tidak ada surat." />

      <Pagination basePath={basePath} searchParams={sp} pageParamName="surat_page" currentPage={page} totalPages={totalPages(totalCount)} />
    </section>
  );
}

function FilterForm({
  basePath,
  sp,
  tabKey,
  showDepartment,
  departments: deptList,
  statusOptions,
  showJenis,
}: {
  basePath: string;
  sp: SearchParams;
  tabKey: string;
  showDepartment: boolean;
  departments?: (typeof departments.$inferSelect)[];
  statusOptions?: Record<string, string>;
  showJenis?: boolean;
}) {
  return (
    <form method="get" className="bg-surface border border-ink-muted/10 rounded-xl p-4 flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="tab" value={tabKey} />
      {showDepartment && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Departemen</label>
          <select name={`${tabKey}_dept`} defaultValue={sp[`${tabKey}_dept`] ?? ""} className="border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
            <option value="">Semua</option>
            {deptList?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {showJenis && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Arah</label>
          <select name={`${tabKey}_jenis`} defaultValue={sp[`${tabKey}_jenis`] ?? ""} className="border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
            <option value="">Semua</option>
            <option value="masuk">Masuk</option>
            <option value="keluar">Keluar</option>
          </select>
        </div>
      )}
      {statusOptions && (
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Status</label>
          <select name={`${tabKey}_status`} defaultValue={sp[`${tabKey}_status`] ?? ""} className="border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface">
            <option value="">Semua</option>
            {Object.entries(statusOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Dari Tanggal</label>
        <DatePicker name={`${tabKey}_from`} defaultValue={sp[`${tabKey}_from`]} />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Sampai Tanggal</label>
        <DatePicker name={`${tabKey}_to`} defaultValue={sp[`${tabKey}_to`]} />
      </div>
      <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
        Filter
      </button>
    </form>
  );
}
