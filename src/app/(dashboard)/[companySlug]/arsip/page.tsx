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
        <h1 className="text-xl font-bold text-gray-900">Arsip & Pencarian</h1>
        <p className="text-gray-500 text-sm mt-1">
          Tiap bagian punya halaman & filter sendiri — tidak digabung jadi 1 daftar panjang.
        </p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {visibleTabs.map((t) => {
          const params2 = new URLSearchParams();
          params2.set("tab", t.key);
          const unread = unreadByTab[t.key];
          return (
            <Link
              key={t.key}
              href={`${basePath}?${params2.toString()}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {!!unread && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{unread}</span>
              )}
            </Link>
          );
        })}
      </div>

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

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey={tabKey} showDepartment={false} statusOptions={DOC_STATUS_LABEL} />

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Judul</th>
              <th className="text-left px-4 py-2">Versi</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Tanggal Efektif</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Tidak ada dokumen {label.toLowerCase()}.
                </td>
              </tr>
            )}
            {pageRows.map((doc) => {
              const v = representativeVersion(doc.id);
              return (
                <tr key={doc.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/${companySlug}/dokumen/${doc.id}`} className="text-blue-600 hover:underline">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{v ? `v${v.versionNumber}` : "-"}</td>
                  <td className="px-4 py-2">{v ? DOC_STATUS_LABEL[v.status] ?? v.status : "-"}</td>
                  <td className="px-4 py-2">{v?.effectiveDate ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey="nd" showDepartment departments={deptList} statusOptions={LETTER_STATUS_LABEL} />

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">No. Nota Dinas</th>
              <th className="text-left px-4 py-2">Perihal</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 italic">
                  Tidak ada nota dinas.
                </td>
              </tr>
            )}
            {rows.map((letter) => (
              <tr key={letter.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/${companySlug}/surat-keluar/${letter.id}`} className="text-blue-600 hover:underline">
                    {letter.letterNumber ?? "(draft)"}
                  </Link>
                </td>
                <td className="px-4 py-2">{letter.subject}</td>
                <td className="px-4 py-2">{LETTER_STATUS_LABEL[letter.status] ?? letter.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

  return (
    <section className="space-y-4">
      <FilterForm basePath={basePath} sp={sp} tabKey="surat" showDepartment departments={deptList} showJenis />

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Arah</th>
              <th className="text-left px-4 py-2">Tanggal</th>
              <th className="text-left px-4 py-2">Perihal</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Tidak ada surat.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.jenis}-${row.id}`} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">{row.jenis === "masuk" ? "Masuk" : "Keluar"}</td>
                <td className="px-4 py-2">{row.tanggal}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/${companySlug}/${row.jenis === "masuk" ? "surat-masuk" : "surat-keluar"}/${row.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {row.subject}
                  </Link>
                </td>
                <td className="px-4 py-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    <form method="get" className="bg-white border border-gray-100 rounded-xl p-4 flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="tab" value={tabKey} />
      {showDepartment && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Departemen</label>
          <select name={`${tabKey}_dept`} defaultValue={sp[`${tabKey}_dept`] ?? ""} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Arah</label>
          <select name={`${tabKey}_jenis`} defaultValue={sp[`${tabKey}_jenis`] ?? ""} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Semua</option>
            <option value="masuk">Masuk</option>
            <option value="keluar">Keluar</option>
          </select>
        </div>
      )}
      {statusOptions && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select name={`${tabKey}_status`} defaultValue={sp[`${tabKey}_status`] ?? ""} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
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
        <label className="block text-xs font-medium text-gray-700 mb-1">Dari Tanggal</label>
        <input type="date" name={`${tabKey}_from`} defaultValue={sp[`${tabKey}_from`] ?? ""} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Sampai Tanggal</label>
        <input type="date" name={`${tabKey}_to`} defaultValue={sp[`${tabKey}_to`] ?? ""} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      </div>
      <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
        Filter
      </button>
    </form>
  );
}
