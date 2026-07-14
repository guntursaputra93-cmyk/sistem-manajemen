import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, kasbonRequests, employees, chartOfAccounts, journalEntries } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { formatRupiah } from "@/lib/finance/format";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { TrailStepper, type TrailStep, type TrailStepStatus } from "@/components/ui/TrailStepper";

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak", lunas: "Lunas" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { pending: "powder-blue", disetujui: "sage", ditolak: "destructive", lunas: "sage" };

// SENGAJA TIDAK di-gate requireModuleEnabled('keuangan') — sama seperti keuangan/kasbon/page.tsx
// (lihat komentar di sana), halaman detail ini juga self-service karyawan.
// RLS row-level (migrasi 0072) otomatis membatasi query di bawah — staff/department_head
// hanya bisa buka detail kasbon miliknya sendiri, baris orang lain pulang notFound().
export default async function KasbonDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; id: string }>;
}) {
  const { companySlug, id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_KASBON_REQUESTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [kasbon] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(kasbonRequests).where(and(eq(kasbonRequests.id, id), eq(kasbonRequests.companyId, company.id)))
  );
  if (!kasbon) notFound();

  const [employee, disbursementAccount, journalEntry] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(employees).where(eq(employees.id, kasbon.employeeId))).then((r) => r[0]),
    kasbon.disbursementAccountId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(chartOfAccounts).where(eq(chartOfAccounts.id, kasbon.disbursementAccountId!))).then((r) => r[0])
      : Promise.resolve(undefined),
    kasbon.journalEntryId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(journalEntries).where(eq(journalEntries.id, kasbon.journalEntryId!))).then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  // Trail: Diajukan -> Disetujui & Dicairkan -> Lunas, dengan cabang Ditolak.
  const KASBON_STEP_DEFS = [
    { id: "pending", label: "Diajukan" },
    { id: "disetujui", label: "Disetujui & Dicairkan" },
    { id: "lunas", label: "Lunas" },
  ];
  let kasbonTrail: TrailStep[];
  if (kasbon.status === "ditolak") {
    kasbonTrail = [
      { id: "pending", label: "Diajukan", status: "done" },
      { id: "disetujui", label: "Ditolak", description: kasbon.rejectionReason ?? undefined, status: "rejected" },
      { id: "lunas", label: "Lunas", status: "upcoming" },
    ];
  } else {
    const idx = kasbon.status === "pending" ? 0 : kasbon.status === "disetujui" ? 1 : 2;
    kasbonTrail = KASBON_STEP_DEFS.map((step, i) => ({
      id: step.id,
      label: step.label,
      status: (i < idx ? "done" : i === idx ? (kasbon.status === "lunas" ? "done" : "pending") : "upcoming") as TrailStepStatus,
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[17px] font-extrabold text-ink">Kasbon — {employee?.fullName ?? "-"}</h1>
          <p className="text-sm text-ink-muted mt-1">{kasbon.purpose}</p>
        </div>
        <Link href={`/${companySlug}/keuangan/kasbon`} className="text-xs text-sage-deep hover:underline">
          &larr; Kembali ke daftar kasbon
        </Link>
      </div>

      <Card title="Status Kasbon">
        <TrailStepper orientation="horizontal" steps={kasbonTrail} />
      </Card>

      <Card title="Detail Kasbon">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
          <div>
            <p className="text-ink-muted">Status</p>
            <Badge variant={STATUS_VARIANT[kasbon.status] ?? "powder-blue"}>{STATUS_LABEL[kasbon.status] ?? kasbon.status}</Badge>
          </div>
          <div>
            <p className="text-ink-muted">Tanggal Pengajuan</p>
            <p className="font-semibold text-ink">{new Date(kasbon.requestDate).toLocaleDateString("id-ID")}</p>
          </div>
          <div>
            <p className="text-ink-muted">Total Kasbon</p>
            <p className="font-semibold text-ink">{formatRupiah(kasbon.totalAmount)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Cicilan per Bulan</p>
            <p className="font-semibold text-ink">{formatRupiah(kasbon.installmentAmount)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Sisa Pinjaman</p>
            <p className="font-semibold text-ink">{formatRupiah(kasbon.remainingBalance)}</p>
          </div>
          {disbursementAccount && (
            <div>
              <p className="text-ink-muted">Akun Pencairan</p>
              <p className="font-semibold text-ink">{disbursementAccount.code} · {disbursementAccount.name}</p>
            </div>
          )}
          {journalEntry && (
            <div>
              <p className="text-ink-muted">Jurnal Pencairan</p>
              {hasPermission(session.user.role, "VIEW_JOURNAL_ENTRIES") ? (
                <Link href={`/${companySlug}/keuangan/jurnal/${journalEntry.id}`} className="font-semibold text-sage-deep hover:underline">
                  {journalEntry.entryNumber ?? "-"}
                </Link>
              ) : (
                <p className="font-semibold text-ink">{journalEntry.entryNumber ?? "-"}</p>
              )}
            </div>
          )}
          {kasbon.status === "ditolak" && kasbon.rejectionReason && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-ink-muted">Alasan Penolakan</p>
              <p className="font-semibold text-ink">{kasbon.rejectionReason}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
