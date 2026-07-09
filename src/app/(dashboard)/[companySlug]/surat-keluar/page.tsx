import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users, outgoingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOutgoingLetter } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

const CATEGORY_LABEL: Record<string, string> = {
  surat_keluar: "Surat Keluar",
  nota_dinas: "Nota Dinas",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "powder-blue",
  menunggu_approval: "dusty-rose",
  disetujui: "sage",
  terkirim: "sage",
  ditolak: "destructive",
};

export default async function SuratKeluarPage({
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

  if (!hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letters, deptList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(outgoingLetters).where(eq(outgoingLetters.companyId, company.id)).orderBy(desc(outgoingLetters.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_OUTGOING_LETTER");
  const self = userList.find((u) => u.id === session.user.id);
  const restrictOwnDepartment = session.user.role === "staff" || session.user.role === "department_head";

  const columns: DataTableColumn<(typeof letters)[number]>[] = [
    { key: "category", header: "Kategori", render: (letter) => CATEGORY_LABEL[letter.letterCategory] },
    {
      key: "number",
      header: "No. Surat",
      render: (letter) => (
        <a href={`/${companySlug}/surat-keluar/${letter.id}`} className="font-medium text-sage-deep hover:underline">
          {letter.letterNumber ?? "(draft)"}
        </a>
      ),
    },
    { key: "subject", header: "Perihal", render: (letter) => letter.subject },
    {
      key: "status",
      header: "Status",
      render: (letter) => <Badge variant={STATUS_VARIANT[letter.status] ?? "powder-blue"}>{STATUS_LABEL[letter.status] ?? letter.status}</Badge>,
    },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Surat Keluar &amp; Nota Dinas</h1>
        <p className="text-sm text-ink-muted mt-1">Draft, ajukan approval, sampai nomor resmi &amp; terkirim.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <Card title="Buat Draft">
          <form action={createOutgoingLetter} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Kategori</label>
              <select
                name="letterCategory"
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                required
              >
                <option value="surat_keluar">Surat Keluar</option>
                <option value="nota_dinas">Nota Dinas</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Departemen (penentu nomor)</label>
              {restrictOwnDepartment ? (
                <>
                  <input type="hidden" name="departmentId" value={self?.departmentId ?? ""} />
                  <p className="border border-ink-muted/10 bg-bg-base rounded-lg px-3 py-2 text-sm text-ink-muted">
                    {deptList.find((d) => d.id === self?.departmentId)?.name ?? "Belum ada departemen"}
                  </p>
                </>
              ) : (
                <select
                  name="departmentId"
                  className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
                  required
                >
                  {deptList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Jenis (bebas, mis. internal)</label>
              <input
                name="jenisKey"
                required
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tujuan Eksternal (utk Surat Keluar)</label>
              <input
                name="recipient"
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tujuan Internal — Departemen (utk Nota Dinas)</label>
              <select
                name="recipientDepartmentId"
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              >
                <option value="">-- tidak ada --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Tujuan Internal — Orang (utk Nota Dinas)</label>
              <select
                name="recipientUserId"
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              >
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Perihal</label>
              <input
                name="subject"
                required
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">Isi (opsional)</label>
              <textarea
                name="bodyContent"
                rows={3}
                className="w-full border border-ink-muted/20 rounded-lg px-3 py-2 text-sm text-ink bg-surface"
              />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Simpan Draft
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={letters} rowKey={(letter) => letter.id} emptyMessage="Belum ada surat keluar atau nota dinas. Draft yang dibuat akan muncul di sini." />
    </div>
  );
}
