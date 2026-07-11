import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, incomingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createIncomingLetter } from "./actions";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const { error, success } = await searchParams;
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
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Surat Masuk</h1>
        <p className="text-sm text-ink-muted mt-1">Registrasi surat masuk &amp; riwayat disposisi.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <Card title="Registrasi Surat Masuk">
          <form action={createIncomingLetter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Surat</label>
              <DatePicker name="letterDate" required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Diterima</label>
              <DatePicker name="receivedDate" required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Pengirim</label>
              <input autoComplete="off"
                name="sender"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tujuan Awal (opsional)</label>
              <select
                name="departmentId"
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              >
                <option value="">-- belum ditentukan --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Perihal</label>
              <input autoComplete="off"
                name="subject"
                required
                className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
              />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Simpan
              </button>
            </div>
          </form>
        </Card>
      )}

      <DataTable columns={columns} rows={letters} rowKey={(letter) => letter.id} emptyMessage="Belum ada surat masuk. Surat yang diregistrasi akan muncul di sini." />
    </div>
  );
}
