import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users, outgoingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOutgoingLetter } from "./actions";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";

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
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string; kategori?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, status, kategori } = await searchParams;
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

  // Penyaringan server-side dari ?q= / ?status= / ?kategori= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const filtered = letters.filter((l) => {
    if (needle && !`${l.letterNumber ?? ""} ${l.subject} ${l.recipient ?? ""}`.toLowerCase().includes(needle)) return false;
    if (status && l.status !== status) return false;
    if (kategori && l.letterCategory !== kategori) return false;
    return true;
  });

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Persuratan" }, { label: "Surat Keluar & Nota Dinas" }]}
        title="Surat Keluar & Nota Dinas"
        description="Draft, ajukan approval, sampai nomor resmi & terkirim."
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Buat Draft" title="Buat Draft Surat" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createOutgoingLetter}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <FormSection title="① Kategori & Nomor">
                  <FormField label="Kategori *">
                    <select name="letterCategory" className={inputClass} required>
                      <option value="surat_keluar">Surat Keluar</option>
                      <option value="nota_dinas">Nota Dinas</option>
                    </select>
                  </FormField>
                  <FormField label="Departemen (penentu nomor)">
                    {restrictOwnDepartment ? (
                      <>
                        <input type="hidden" name="departmentId" value={self?.departmentId ?? ""} />
                        <p className="rounded-[9px] border border-ink-muted/10 bg-bg-base px-3 py-2 text-[13px] text-ink-muted">
                          {deptList.find((d) => d.id === self?.departmentId)?.name ?? "Belum ada departemen"}
                        </p>
                      </>
                    ) : (
                      <select name="departmentId" className={inputClass} required>
                        {deptList.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </FormField>
                  <FormField label="Jenis" hint="bebas, mis. internal" full>
                    <input autoComplete="off" name="jenisKey" required className={inputClass} />
                  </FormField>
                </FormSection>
                <FormSection title="② Tujuan">
                  <FormField label="Tujuan Eksternal" hint="untuk Surat Keluar" full>
                    <input autoComplete="off" name="recipient" className={inputClass} />
                  </FormField>
                  <FormField label="Internal — Departemen" hint="untuk Nota Dinas">
                    <select name="recipientDepartmentId" className={inputClass}>
                      <option value="">-- tidak ada --</option>
                      {deptList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Internal — Orang" hint="untuk Nota Dinas">
                    <select name="recipientUserId" className={inputClass}>
                      <option value="">-- tidak ada --</option>
                      {userList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </FormSection>
                <FormSection title="③ Isi Surat">
                  <FormField label="Perihal *" full>
                    <input autoComplete="off" name="subject" required className={inputClass} />
                  </FormField>
                  <FormField label="Isi" optional full>
                    <textarea autoComplete="off" name="bodyContent" rows={4} className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Draft" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <ListToolbar
        searchPlaceholder="Cari no. surat, perihal, atau tujuan…"
        filters={[
          {
            name: "kategori",
            allLabel: "Semua Kategori",
            options: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            name: "status",
            allLabel: "Semua Status",
            options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
          },
        ]}
        countLabel={`${filtered.length} surat`}
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(letter) => letter.id}
        emptyMessage={needle || status || kategori ? "Tidak ada surat yang cocok dengan pencarian/filter." : "Belum ada surat keluar atau nota dinas. Draft yang dibuat akan muncul di sini."}
      />
    </div>
  );
}
