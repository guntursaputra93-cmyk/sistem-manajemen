import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employees, departments, positionHistory, attachments, users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { updateEmployee, changeEmployeePositionAction, updateEmployeeStatusAction } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { TrailStepper, type TrailStep, type TrailStepStatus } from "@/components/ui/TrailStepper";
import { PageHeader } from "@/components/ui/PageHeader";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";

const STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  cuti_panjang: "Cuti Panjang",
  resign: "Resign",
  diberhentikan: "Diberhentikan",
};

const CHANGE_TYPE_LABEL: Record<string, string> = {
  awal: "Posisi Awal",
  promosi: "Promosi",
  demosi: "Demosi",
  mutasi: "Mutasi",
};

const POSITION_TRAIL_STATUS: Record<string, TrailStepStatus> = {
  active: "pending",
  superseded: "done",
};

export default async function KaryawanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_EMPLOYEES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId, userId: session.user.id };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_data_karyawan", companySlug }));

  const [employee] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, company.id)))
  );
  if (!employee) notFound();

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));
  if (visibleEmployeeIds && !visibleEmployeeIds.includes(employee.id)) {
    // RLS row-level (migrasi 0036) sudah menahan ini di level DB — notFound() di
    // sini cuma pertahanan tambahan di level aplikasi (dan UX: 404, bukan crash).
    notFound();
  }

  const [deptList, historyRows, docAttachments, linkedUser] = await Promise.all([
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(positionHistory).where(eq(positionHistory.employeeId, employee.id)).orderBy(asc(positionHistory.effectiveDate))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(attachments).where(and(eq(attachments.entityType, "employee"), eq(attachments.entityId, employee.id)))
    ),
    employee.userId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(users).where(eq(users.id, employee.userId!))).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const canManage = hasPermission(session.user.role, "MANAGE_EMPLOYEES");
  const canManagePosition = hasPermission(session.user.role, "MANAGE_POSITION_HISTORY");
  // Tombol "Berikan Akses Sistem" mengarah ke /pengaturan/user (MANAGE_USERS) —
  // gate ganda supaya tombol tidak muncul untuk role yang nanti akan ditolak
  // begitu sampai di halaman itu (saat ini kedua permission sama-sama
  // super_admin/company_admin, tapi dicek eksplisit untuk jaga-jaga kalau beda nanti).
  const canGrantAccess = canManage && hasPermission(session.user.role, "MANAGE_USERS");

  const positionSteps: TrailStep[] = historyRows.map((p): TrailStep => ({
    id: p.id,
    label: p.positionTitle,
    description: [CHANGE_TYPE_LABEL[p.changeType] ?? p.changeType, p.notes].filter(Boolean).join(" — "),
    caption: p.status === "active" ? "Berjalan" : (p.endDate ?? undefined),
    status: POSITION_TRAIL_STATUS[p.status] ?? "upcoming",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "SDM" },
          { label: "Data Karyawan", href: `/${companySlug}/sdm/karyawan` },
          { label: employee.fullName },
        ]}
        title={employee.fullName}
        description={
          <>
            {employee.currentPositionTitle ?? "-"} —{" "}
            <Badge variant={employee.employmentStatus === "aktif" ? "sage" : "dusty-rose"}>
              {STATUS_LABEL[employee.employmentStatus] ?? employee.employmentStatus}
            </Badge>
          </>
        }
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Detail Karyawan">
        {canManage ? (
          <form action={updateEmployee} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="employeeId" value={employee.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">NIK</label>
              <input name="nik" defaultValue={employee.nik} required autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Lengkap</label>
              <input name="fullName" defaultValue={employee.fullName} required autoComplete="new-password" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Email (opsional)</label>
              <input name="email" type="email" defaultValue={employee.email ?? ""} autoComplete="new-password" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">NPWP (opsional)</label>
              <input name="npwp" defaultValue={employee.npwp ?? ""} autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Lahir</label>
              <DatePicker name="birthDate" defaultValue={employee.birthDate} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Telepon</label>
              <input name="phone" defaultValue={employee.phone ?? ""} autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Alamat</label>
              <input name="address" defaultValue={employee.address ?? ""} autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontak Darurat — Nama</label>
              <input name="emergencyContactName" defaultValue={employee.emergencyContactName ?? ""} autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Kontak Darurat — Telepon</label>
              <input name="emergencyContactPhone" defaultValue={employee.emergencyContactPhone ?? ""} autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit
              </button>
            </div>
          </form>
        ) : (
          <dl className="text-sm space-y-2">
            <div><dt className="text-ink-muted inline">NIK: </dt><dd className="inline text-ink">{employee.nik}</dd></div>
            <div><dt className="text-ink-muted inline">Email: </dt><dd className="inline text-ink">{employee.email ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">NPWP: </dt><dd className="inline text-ink">{employee.npwp ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Tanggal Bergabung: </dt><dd className="inline text-ink">{employee.joinDate}</dd></div>
            <div><dt className="text-ink-muted inline">Telepon: </dt><dd className="inline text-ink">{employee.phone ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Alamat: </dt><dd className="inline text-ink">{employee.address ?? "-"}</dd></div>
            <div><dt className="text-ink-muted inline">Kontak Darurat: </dt><dd className="inline text-ink">{[employee.emergencyContactName, employee.emergencyContactPhone].filter(Boolean).join(" — ") || "-"}</dd></div>
          </dl>
        )}
      </Card>

      <Card title="Akses Sistem">
        {linkedUser ? (
          <p className="text-sm text-ink">Sudah punya akses sistem (email: {linkedUser.email}).</p>
        ) : canGrantAccess ? (
          <>
            <p className="text-sm text-ink-muted mb-3">Karyawan ini belum terhubung ke akun login manapun.</p>
            <Link
              href={`/${companySlug}/pengaturan/user?linkEmployeeId=${employee.id}&prefillFullName=${encodeURIComponent(employee.fullName)}&prefillEmail=${encodeURIComponent(employee.email ?? "")}`}
              className="inline-block bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]"
            >
              Berikan Akses Sistem
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-muted italic">Karyawan ini belum punya akses sistem.</p>
        )}
      </Card>

      <Card title="Riwayat Jabatan">
        {positionSteps.length === 0 ? (
          <p className="text-sm text-ink-muted italic">Belum ada riwayat jabatan.</p>
        ) : (
          <TrailStepper orientation="horizontal" steps={positionSteps} />
        )}

        {canManagePosition && (
          <form action={changeEmployeePositionAction} className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="employeeId" value={employee.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jabatan Baru</label>
              <input name="positionTitle" required autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenis Perubahan</label>
              <select name="changeType" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="promosi">Promosi</option>
                <option value="demosi">Demosi</option>
                <option value="mutasi">Mutasi</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Departemen</label>
              <select name="departmentId" defaultValue={employee.departmentId ?? ""} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- tidak ada --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Jenjang (opsional)</label>
              <input name="jobLevel" autoComplete="off" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Efektif</label>
              <DatePicker name="effectiveDate" required />
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan (opsional)</label>
              <textarea autoComplete="off" name="notes" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Catat Perubahan Posisi
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Dokumen Kepegawaian">
        <AttachmentUploader entityType="employee" entityId={employee.id} attachments={docAttachments} />
      </Card>

      {canManage && (
        <Card title="Status Kepegawaian">
          <form action={updateEmployeeStatusAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="employeeId" value={employee.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Status</label>
              <select name="employmentStatus" defaultValue={employee.employmentStatus} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Resign/Diberhentikan (kalau relevan)</label>
              <DatePicker name="resignDate" defaultValue={employee.resignDate} />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit Status
              </button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
