import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, kasbonRequests, employees, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { getEmployeeByUserId } from "@/lib/hr/employees";
import { createKasbonRequestAction, approveKasbonAction, rejectKasbonAction } from "./actions";
import { formatRupiah } from "@/lib/finance/format";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak", lunas: "Lunas" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { pending: "powder-blue", disetujui: "sage", ditolak: "destructive", lunas: "sage" };

// SENGAJA TIDAK di-gate requireModuleEnabled('keuangan') — beda dari SEMUA halaman
// Keuangan lain (Langkah 10 spesifikasi Bagian 2: daftar sweep eksplisit tidak
// menyertakan kasbon). Kasbon adalah fitur self-service karyawan (pengajuan &
// pencairan pinjaman), bukan laporan/pencatatan akuntansi — harus tetap bisa diakses
// staff terlepas admin sudah mengaktifkan modul Keuangan atau belum, makanya juga
// ditaruh di grup sidebar "SDM" (layout.tsx), bukan grup "Keuangan".
// BEDA dari halaman keuangan lain: staff/department_head IKUT bisa membuka halaman
// ini (VIEW_/CREATE_KASBON_REQUEST menyertakan mereka) — RLS row-level (migrasi 0072)
// otomatis membatasi query di bawah hanya mengembalikan baris kasbon & employee
// miliknya sendiri untuk role selain admin, jadi tidak perlu scoping app-level manual.
export default async function KasbonPage({
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

  if (!hasPermission(session.user.role, "VIEW_KASBON_REQUESTS")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_KASBON_REQUESTS");
  const canCreate = hasPermission(session.user.role, "CREATE_KASBON_REQUEST");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [kasbonList, employeeList, ownEmployee, disbursementAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(kasbonRequests).where(eq(kasbonRequests.companyId, company.id)).orderBy(asc(kasbonRequests.status), asc(kasbonRequests.requestDate))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(employees).where(eq(employees.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => getEmployeeByUserId(tx, { companyId: company.id, userId: session.user.id })),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.accountType, "aset"), eq(chartOfAccounts.isHeader, false)))
    ),
  ]);

  const employeeNameById = new Map(employeeList.map((e) => [e.id, e.fullName]));
  const canActuallyCreate = canCreate && !!ownEmployee;

  const columns: DataTableColumn<(typeof kasbonList)[number]>[] = [
    {
      key: "employee",
      header: "Karyawan",
      render: (k) => (
        <Link href={`/${companySlug}/keuangan/kasbon/${k.id}`} className="font-medium text-sage-deep hover:underline">
          {employeeNameById.get(k.employeeId) ?? "-"}
        </Link>
      ),
    },
    { key: "date", header: "Tgl Pengajuan", render: (k) => new Date(k.requestDate).toLocaleDateString("id-ID") },
    { key: "total", header: "Total Kasbon", render: (k) => formatRupiah(k.totalAmount), className: "text-right" },
    { key: "installment", header: "Cicilan/Bulan", render: (k) => formatRupiah(k.installmentAmount), className: "text-right" },
    { key: "remaining", header: "Sisa", render: (k) => formatRupiah(k.remainingBalance), className: "text-right" },
    { key: "purpose", header: "Keperluan", render: (k) => k.purpose },
    { key: "status", header: "Status", render: (k) => <Badge variant={STATUS_VARIANT[k.status] ?? "powder-blue"}>{STATUS_LABEL[k.status] ?? k.status}</Badge> },
    {
      key: "actions",
      header: "Aksi",
      render: (k) =>
        canManage && k.status === "pending" ? (
          <div className="flex flex-col gap-2">
            <form action={approveKasbonAction} className="flex items-center gap-1">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="kasbonRequestId" value={k.id} />
              <select name="disbursementAccountId" required className="border border-ink-muted/12 rounded-lg px-1.5 py-1 text-[10px] text-ink bg-bg-base">
                <option value="">Akun kas/bank...</option>
                {disbursementAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                Setujui &amp; Cairkan
              </button>
            </form>
            <form action={rejectKasbonAction} className="flex items-center gap-1">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="kasbonRequestId" value={k.id} />
              <input autoComplete="off" name="rejectionReason" required placeholder="Alasan tolak" className="border border-ink-muted/12 rounded-lg px-1.5 py-1 text-[10px] text-ink bg-bg-base w-28" />
              <button type="submit" className="bg-destructive hover:bg-destructive/90 text-white text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors">
                Tolak
              </button>
            </form>
          </div>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Kasbon" }]}
        title="Kasbon"
        description={canManage ? `Semua pengajuan kasbon ${company.name}.` : "Pengajuan kasbon milikmu."}
        actions={
          canActuallyCreate && (
            <FormDrawer buttonLabel="Ajukan Kasbon" title="Ajukan Kasbon" defaultOpen={Boolean(error)}>
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createKasbonRequestAction}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Detail Pengajuan">
                  <FormField label="Total Kasbon *">
                    <input autoComplete="off" name="totalAmount" type="number" step="0.01" min="0.01" required placeholder="0" className={inputClass} />
                  </FormField>
                  <FormField label="Cicilan per Bulan *">
                    <input autoComplete="off" name="installmentAmount" type="number" step="0.01" min="0.01" required placeholder="0" className={inputClass} />
                  </FormField>
                  <FormField label="Keperluan *" full>
                    <input autoComplete="off" name="purpose" required placeholder="mis. Kebutuhan mendesak keluarga" className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Ajukan Kasbon" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={kasbonList} rowKey={(k) => k.id} emptyMessage="Belum ada pengajuan kasbon." />
    </div>
  );
}
