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
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
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

  const rows: DocRow[] = docList.map((doc) => {
    const version = latestVersionOf(doc.id);
    return { id: doc.id, title: doc.title, categoryId: doc.categoryId, latestVersion: version ? { versionNumber: version.versionNumber, status: version.status } : null };
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Dokumen Perusahaan</h1>
        <p className="text-sm text-ink-muted mt-1">Peraturan Perusahaan, SK Direktur, dan dokumen lain — dengan versioning.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <Card title="Buat Dokumen Baru">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-muted italic">
              Belum ada kategori dokumen. Admin perlu atur dulu di{" "}
              <Link href={`/${companySlug}/pengaturan/kategori-dokumen`} className="text-sage-deep hover:underline">
                Pengaturan &rarr; Kategori Dokumen
              </Link>
              .
            </p>
          ) : (
            <form action={createDocument} className="grid grid-cols-2 gap-4">
              <input type="hidden" name="companySlug" value={companySlug} />
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-muted mb-1">Judul</label>
                <input
                  name="title"
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Kategori</label>
                <select
                  name="categoryId"
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Tanggal Efektif (opsional)</label>
                <DatePicker name="effectiveDate" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">Berlaku Sampai (opsional)</label>
                <DatePicker name="expiresAt" />
              </div>
              <div className="col-span-2">
                <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  Buat Dokumen (Draft Versi 1)
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      <DataTable columns={columns} rows={rows} rowKey={(doc) => doc.id} emptyMessage="Belum ada dokumen. Dokumen yang dibuat akan muncul di sini." />
    </div>
  );
}
