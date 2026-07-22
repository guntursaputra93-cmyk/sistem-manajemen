import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, incomingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createIncomingLetter } from "./actions";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";
import { ListToolbar } from "@/components/ui/ListToolbar";

const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  didisposisikan: "Didisposisikan",
  selesai: "Selesai",
  diarsipkan: "Diarsipkan",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  baru: "powder-blue",
  didisposisikan: "sage",
  selesai: "sage",
  diarsipkan: "dusty-rose",
};

export default async function SuratMasukPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string; q?: string; status?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success, q, status } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_INCOMING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letters, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(incomingLetters).where(eq(incomingLetters.companyId, company.id)).orderBy(desc(incomingLetters.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
    ),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_INCOMING_LETTER");

  // Penyaringan server-side dari ?q= / ?status= yang di-set ListToolbar.
  const needle = q?.trim().toLowerCase();
  const filtered = letters.filter((l) => {
    if (needle && !`${l.agendaNumber} ${l.sender} ${l.subject}`.toLowerCase().includes(needle)) return false;
    if (status && l.status !== status) return false;
    return true;
  });

  const columns: DataTableColumn<(typeof letters)[number]>[] = [
    {
      key: "agenda",
      header: "No. Agenda",
      render: (letter) => (
        <a href={`/${companySlug}/surat-masuk/${letter.id}`} className="font-medium text-sage-deep hover:underline">
          {letter.agendaNumber}
        </a>
      ),
    },
    { key: "sender", header: "Pengirim", render: (letter) => letter.sender },
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
        breadcrumb={[{ label: "Persuratan" }, { label: "Surat Masuk" }]}
        title="Surat Masuk"
        description="Registrasi surat masuk & riwayat disposisi."
        actions={
          canCreate && (
            <FormDrawer buttonLabel="Registrasi Surat" title="Registrasi Surat Masuk" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createIncomingLetter}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <FormSection title="Detail Surat">
                  <FormField label="Tanggal Surat *">
                    <DatePicker name="letterDate" required />
                  </FormField>
                  <FormField label="Tanggal Diterima *">
                    <DatePicker name="receivedDate" required />
                  </FormField>
                  <FormField label="Pengirim *" full>
                    <input autoComplete="off" name="sender" required className={inputClass} />
                  </FormField>
                  <FormField label="Tujuan Awal" optional full>
                    <select name="departmentId" className={inputClass}>
                      <option value="">-- belum ditentukan --</option>
                      {deptList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Perihal *" full>
                    <input autoComplete="off" name="subject" required className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Surat" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <ListToolbar
        searchPlaceholder="Cari no. agenda, pengirim, atau perihal…"
        filters={[
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
        emptyMessage={needle || status ? "Tidak ada surat yang cocok dengan pencarian/filter." : "Belum ada surat masuk. Surat yang diregistrasi akan muncul di sini."}
      />
    </div>
  );
}
