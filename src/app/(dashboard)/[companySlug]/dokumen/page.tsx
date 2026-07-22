import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, documentCategories, documents, documentVersions, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { expireOverdueDocumentVersions } from "@/lib/documents/versions";
import { canViewDocument } from "@/lib/documents/access";
import { requireModuleEnabled } from "@/lib/modules";
import { createDocument } from "./actions";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "Sedang Direview",
  active: "Aktif",
  superseded: "Digantikan",
  expired: "Kedaluwarsa",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "powder-blue",
  in_review: "dusty-rose",
  active: "sage",
  superseded: "powder-blue",
  expired: "destructive",
};

type DocRow = { id: string; title: string; categoryId: string; latestVersion: { versionNumber: number; status: string } | null };

export default async function DokumenPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; q?: string; kategori?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, kategori, status } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_DOCUMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "pengendalian_dokumen", companySlug }));

  // Lazy expire-on-read: sesuai keputusan, cek tiap kali halaman dibuka, tidak pakai cron.
  await withTenantContext(tenantContext, (tx) => expireOverdueDocumentVersions(tx, { companyId: company.id }));

  const [allDocs, categories, versions, selfUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(documents).where(eq(documents.companyId, company.id)).orderBy(desc(documents.createdAt))),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(documentCategories).where(eq(documentCategories.companyId, company.id)).orderBy(asc(documentCategories.hierarchyLevel))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(documentVersions).where(eq(documentVersions.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, session.user.id))).then((r) => r[0]),
  ]);

  const viewer = { role: session.user.role as Role, departmentId: selfUser?.departmentId ?? null };
  const visibility = await withTenantContext(tenantContext, (tx) =>
    Promise.all(allDocs.map((doc) => canViewDocument(tx, { companyId: company.id, documentId: doc.id, categoryId: doc.categoryId, viewer })))
  );
  const docList = allDocs.filter((_, i) => visibility[i]);

  const canCreate = hasPermission(session.user.role, "CREATE_DOCUMENT");

  function latestVersionOf(documentId: string) {
    const versionsForDoc = versions.filter((v) => v.documentId === documentId);
    return versionsForDoc.find((v) => v.status === "active") ?? versionsForDoc.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  const allRows: DocRow[] = docList.map((doc) => {
    const version = latestVersionOf(doc.id);
    return { id: doc.id, title: doc.title, categoryId: doc.categoryId, latestVersion: version ? { versionNumber: version.versionNumber, status: version.status } : null };
  });

  // Penyaringan server-side dari ?q= / ?kategori= / ?status= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const rows = allRows.filter((doc) => {
    if (needle && !doc.title.toLowerCase().includes(needle)) return false;
    if (kategori && doc.categoryId !== kategori) return false;
    if (status && doc.latestVersion?.status !== status) return false;
    return true;
  });

  const columns: DataTableColumn<DocRow>[] = [
    {
      key: "title",
      header: "Judul",
      render: (doc) => (
        <a href={`/${companySlug}/dokumen/${doc.id}`} className="font-medium text-sage-deep hover:underline">
          {doc.title}
        </a>
      ),
    },
    { key: "category", header: "Kategori", render: (doc) => categories.find((c) => c.id === doc.categoryId)?.name ?? "-" },
    { key: "version", header: "Versi Terbaru", render: (doc) => (doc.latestVersion ? `v${doc.latestVersion.versionNumber}` : "-") },
    {
      key: "status",
      header: "Status",
      render: (doc) =>
        doc.latestVersion ? (
          <Badge variant={STATUS_VARIANT[doc.latestVersion.status] ?? "powder-blue"}>{STATUS_LABEL[doc.latestVersion.status] ?? doc.latestVersion.status}</Badge>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Persuratan" }, { label: "Dokumen Perusahaan" }]}
        title="Dokumen Perusahaan"
        description="Peraturan Perusahaan, SK Direktur, dan dokumen lain — dengan versioning."
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Buat Dokumen" title="Buat Dokumen Baru" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {categories.length === 0 ? (
                <p className="text-[13px] text-ink-muted italic">
                  Belum ada kategori dokumen. Admin perlu atur dulu di{" "}
                  <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className="text-sage-deep hover:underline">
                    Pengaturan &rarr; Kategori Dokumen
                  </Link>
                  .
                </p>
              ) : (
                <form action={createDocument}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <FormSection title="Detail Dokumen">
                    <FormField label="Judul *" full>
                      <input autoComplete="off" name="title" required className={inputClass} />
                    </FormField>
                    <FormField label="Kategori *" full>
                      <select name="categoryId" required className={inputClass}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Tanggal Efektif" optional>
                      <DatePicker name="effectiveDate" />
                    </FormField>
                    <FormField label="Berlaku Sampai" optional>
                      <DatePicker name="expiresAt" />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Buat Dokumen (Draft Versi 1)" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <ListToolbar
        searchPlaceholder="Cari judul dokumen…"
        filters={[
          {
            name: "kategori",
            allLabel: "Semua Kategori",
            options: categories.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
          },
          {
            name: "status",
            allLabel: "Semua Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        countLabel={`${rows.length} dokumen`}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(doc) => doc.id}
        emptyMessage={needle || kategori || status ? "Tidak ada dokumen yang cocok dengan pencarian/filter." : "Belum ada dokumen. Dokumen yang dibuat akan muncul di sini."}
      />
    </div>
  );
}
