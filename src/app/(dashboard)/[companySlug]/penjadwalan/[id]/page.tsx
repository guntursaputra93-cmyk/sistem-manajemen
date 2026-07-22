import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, serviceAssignments, serviceAssignmentTeam, contracts, organizations, employees, witnessedAuditEvaluations, performanceEvaluations } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getVisibleEmployeeIds, resolveViewer } from "@/lib/hr/employees";
import { getTerminology } from "@/lib/modules/terminology";
import { DEFAULT_WITNESSED_AUDIT_ASPECTS, DEFAULT_PERFORMANCE_EVALUATION_ASPECTS, SCORE_SCALE, parseScores, averageScore } from "@/lib/scheduling/evaluations";
import {
  updateServiceAssignmentDetails,
  updateServiceAssignmentStatus,
  addTeamMember,
  removeTeamMember,
  createWitnessedAuditEvaluation,
  toggleEvaluationSigned,
  createPerformanceEvaluation,
  togglePerformanceEvaluationSigned,
} from "../actions";
import { Card } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";
import { PageHeader } from "@/components/ui/PageHeader";

const TERMINOLOGY_DEFAULTS = { personLabel: "Auditor", assignmentLabel: "Penugasan" };
const STATUS_LABEL: Record<string, string> = { dijadwalkan: "Dijadwalkan", berlangsung: "Berlangsung", selesai: "Selesai", dibatalkan: "Dibatalkan" };
const TRAIL_STATUSES = ["dijadwalkan", "berlangsung", "selesai"] as const;

export default async function ServiceAssignmentDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_SERVICE_ASSIGNMENTS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "penjadwalan_layanan", companySlug }));

  const terminology = await withTenantContext(tenantContext, (tx) =>
    getTerminology(tx, { companyId: company.id, moduleKey: "penjadwalan_layanan", defaults: TERMINOLOGY_DEFAULTS })
  );

  const [row] = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({
        assignment: serviceAssignments,
        organizationName: organizations.name,
        organizationIndustry: organizations.industry,
        employeeName: employees.fullName,
      })
      .from(serviceAssignments)
      .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
      .innerJoin(organizations, eq(organizations.id, contracts.organizationId))
      .innerJoin(employees, eq(employees.id, serviceAssignments.employeeId))
      .where(and(eq(serviceAssignments.id, id), eq(serviceAssignments.companyId, company.id)))
  );
  if (!row) notFound();

  const teamRows = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ id: serviceAssignmentTeam.id, roleInTeam: serviceAssignmentTeam.roleInTeam, employeeName: employees.fullName, employeeId: serviceAssignmentTeam.employeeId })
      .from(serviceAssignmentTeam)
      .innerJoin(employees, eq(employees.id, serviceAssignmentTeam.employeeId))
      .where(eq(serviceAssignmentTeam.assignmentId, id))
  );

  const viewer = await withTenantContext(tenantContext, (tx) => resolveViewer(tx, { userId: session.user.id, role: session.user.role as Role }));
  const visibleEmployeeIds = await withTenantContext(tenantContext, (tx) => getVisibleEmployeeIds(tx, { companyId: company.id, viewer }));
  if (visibleEmployeeIds !== null) {
    const isVisible = visibleEmployeeIds.includes(row.assignment.employeeId) || teamRows.some((t) => visibleEmployeeIds.includes(t.employeeId));
    if (!isVisible) redirect(`/${companySlug}/dashboard`);
  }

  const canManage = hasPermission(session.user.role, "MANAGE_SERVICE_ASSIGNMENTS");
  const canManageEvaluations = hasPermission(session.user.role, "MANAGE_WITNESSED_AUDIT_EVALUATIONS");
  const canManagePerformanceEvaluations = hasPermission(session.user.role, "MANAGE_PERFORMANCE_EVALUATIONS");

  const [availableTeamCandidates, evaluationRows, performanceRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(employees).where(and(eq(employees.companyId, company.id), eq(employees.employmentStatus, "aktif")))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ evaluation: witnessedAuditEvaluations, observerName: employees.fullName })
        .from(witnessedAuditEvaluations)
        .innerJoin(employees, eq(employees.id, witnessedAuditEvaluations.observerEmployeeId))
        .where(eq(witnessedAuditEvaluations.assignmentId, id))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ evaluation: performanceEvaluations, evaluatorName: employees.fullName })
        .from(performanceEvaluations)
        .innerJoin(employees, eq(employees.id, performanceEvaluations.evaluatorEmployeeId))
        .where(eq(performanceEvaluations.assignmentId, id))
    ),
  ]);
  const teamMemberIds = new Set(teamRows.map((t) => t.employeeId));
  const candidateOptions = availableTeamCandidates.filter((e) => e.id !== row.assignment.employeeId && !teamMemberIds.has(e.id));

  const currentStepIndex = TRAIL_STATUSES.indexOf(row.assignment.status as (typeof TRAIL_STATUSES)[number]);
  const trail: TrailStep[] =
    row.assignment.status === "dibatalkan"
      ? TRAIL_STATUSES.map((s, i) => ({ id: s, label: STATUS_LABEL[s], status: i === 0 ? "rejected" : "upcoming" }))
      : TRAIL_STATUSES.map((s, i) => ({
          id: s,
          label: STATUS_LABEL[s],
          status: i < currentStepIndex ? "done" : i === currentStepIndex ? (s === "selesai" ? "done" : "pending") : "upcoming",
        }));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Penjadwalan" },
          { label: terminology.assignmentLabel, href: `/${companySlug}/penjadwalan` },
          { label: row.organizationName },
        ]}
        title={`${terminology.assignmentLabel} — ${row.organizationName}`}
        description={`${terminology.personLabel}: ${row.employeeName}`}
        actions={<Badge variant={row.assignment.status === "dibatalkan" ? "destructive" : "sage"}>{STATUS_LABEL[row.assignment.status]}</Badge>}
      />

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Status">
        <TrailStepper orientation="horizontal" steps={trail} />
        {canManage && (
          <form action={updateServiceAssignmentStatus} className="flex items-end gap-3 mt-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assignmentId" value={row.assignment.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ubah Status</label>
              <select name="status" defaultValue={row.assignment.status} className="border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
              Edit Status
            </button>
          </form>
        )}
      </Card>

      <Card title="Detail Penugasan">
        {canManage ? (
          <form action={updateServiceAssignmentDetails} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assignmentId" value={row.assignment.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Mulai</label>
              <DatePicker name="assignmentDate" defaultValue={row.assignment.assignmentDate} required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Selesai (opsional)</label>
              <DatePicker name="endDate" defaultValue={row.assignment.endDate} />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Lokasi (opsional)</label>
              <input autoComplete="off" name="location" defaultValue={row.assignment.location ?? ""} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Edit
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[11px]">
            <div><dt className="text-ink-muted">Tanggal Mulai</dt><dd className="text-ink font-medium">{row.assignment.assignmentDate}</dd></div>
            <div><dt className="text-ink-muted">Tanggal Selesai</dt><dd className="text-ink font-medium">{row.assignment.endDate ?? "-"}</dd></div>
            <div className="col-span-2"><dt className="text-ink-muted">Lokasi</dt><dd className="text-ink font-medium">{row.assignment.location ?? "-"}</dd></div>
          </dl>
        )}
        {row.assignment.competencyWarningAcknowledged && (
          <p className="text-[10px] text-dusty-rose-deep mt-3">⚠ Penugasan ini dibuat dengan peringatan kompetensi yang sudah dikonfirmasi admin.</p>
        )}
      </Card>

      <Card title="Anggota Tim Tambahan">
        <ul className="space-y-2 mb-4">
          {teamRows.length === 0 && <li className="text-[11px] text-ink-muted italic">Belum ada anggota tim tambahan.</li>}
          {teamRows.map((t) => (
            <li key={t.id} className="flex items-center justify-between text-[11px] border border-ink-muted/12 rounded-lg px-3 py-2">
              <span>{t.employeeName}{t.roleInTeam ? ` — ${t.roleInTeam}` : ""}</span>
              {canManage && (
                <form action={removeTeamMember}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="assignmentId" value={row.assignment.id} />
                  <input type="hidden" name="teamMemberId" value={t.id} />
                  <button type="submit" className="text-[10px] font-semibold text-destructive hover:underline">Hapus</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canManage && candidateOptions.length > 0 && (
          <form action={addTeamMember} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assignmentId" value={row.assignment.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Karyawan</label>
              <select name="employeeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {candidateOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Peran (opsional)</label>
              <input autoComplete="off" name="roleInTeam" placeholder="mis. Ketua Tim / Anggota" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Tambah Anggota
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Evaluasi Witnessed Audit" description="Penilaian per-aspek oleh observer yang menyaksikan personil bekerja di lapangan (FR-03).">
        <ul className="space-y-3 mb-4">
          {evaluationRows.length === 0 && <li className="text-[11px] text-ink-muted italic">Belum ada evaluasi witnessed audit tercatat.</li>}
          {evaluationRows.map(({ evaluation, observerName }) => {
            const scores = parseScores(evaluation.scores);
            const avg = averageScore(scores);
            return (
              <li key={evaluation.id} className="border border-ink-muted/12 rounded-lg px-3 py-2.5 text-[11px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{evaluation.evaluationDate} — Observer: {observerName}</span>
                  {avg !== null && <Badge variant={avg >= 3 ? "sage" : "dusty-rose"}>Rata-rata {avg.toFixed(1)}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
                  {scores.map((s) => (
                    <span key={s.aspect}>{s.aspect}: <span className="font-semibold text-ink">{s.score}</span></span>
                  ))}
                </div>
                {evaluation.feedbackNotes && <p className="text-ink-muted italic">&ldquo;{evaluation.feedbackNotes}&rdquo;</p>}
                {canManageEvaluations && (
                  <div className="flex items-center gap-4 pt-1">
                    {(["observerSigned", "auditeeSigned"] as const).map((field) => (
                      <form key={field} action={toggleEvaluationSigned}>
                        <input type="hidden" name="companySlug" value={companySlug} />
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="assignmentId" value={row.assignment.id} />
                        <input type="hidden" name="evaluationId" value={evaluation.id} />
                        <input type="hidden" name="field" value={field} />
                        <input type="hidden" name="nextSigned" value={(!evaluation[field]).toString()} />
                        <button type="submit" className={`text-[10px] font-semibold ${evaluation[field] ? "text-sage-deep" : "text-ink-muted"} hover:underline`}>
                          {field === "observerSigned" ? "Observer" : "Auditee"}: {evaluation[field] ? "✓ Ditandatangani" : "Belum ditandatangani"}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canManageEvaluations && (
          <form action={createWitnessedAuditEvaluation} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assignmentId" value={row.assignment.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Observer</label>
              <select name="observerEmployeeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {availableTeamCandidates.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Evaluasi</label>
              <DatePicker name="evaluationDate" required />
            </div>
            <div className="col-span-full grid grid-cols-2 sm:grid-cols-3 gap-4">
              {DEFAULT_WITNESSED_AUDIT_ASPECTS.map((aspect, i) => (
                <div key={aspect}>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">{aspect}</label>
                  <select name={`score_${i}`} required defaultValue="" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                    <option value="" disabled>-- skor --</option>
                    {SCORE_SCALE.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan Feedback (opsional)</label>
              <textarea autoComplete="off" name="feedbackNotes" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Simpan Evaluasi
              </button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Evaluasi Kinerja" description="Penilaian top-down oleh Ketua Tim/Technical Manager per penugasan (FR-04).">
        <ul className="space-y-3 mb-4">
          {performanceRows.length === 0 && <li className="text-[11px] text-ink-muted italic">Belum ada evaluasi kinerja tercatat.</li>}
          {performanceRows.map(({ evaluation, evaluatorName }) => {
            const scores = parseScores(evaluation.scores);
            const avg = averageScore(scores);
            return (
              <li key={evaluation.id} className="border border-ink-muted/12 rounded-lg px-3 py-2.5 text-[11px] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{evaluation.evaluationDate} — Evaluator: {evaluatorName}</span>
                  {avg !== null && <Badge variant={avg >= 3 ? "sage" : "dusty-rose"}>Rata-rata {avg.toFixed(1)}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
                  {scores.map((s) => (
                    <span key={s.aspect}>{s.aspect}: <span className="font-semibold text-ink">{s.score}</span></span>
                  ))}
                </div>
                {evaluation.conclusionNotes && <p className="text-ink-muted italic">&ldquo;{evaluation.conclusionNotes}&rdquo;</p>}
                {canManagePerformanceEvaluations && (
                  <div className="flex items-center gap-4 pt-1">
                    {(["evaluatorSigned", "knownByTechnicalManagerSigned"] as const).map((field) => (
                      <form key={field} action={togglePerformanceEvaluationSigned}>
                        <input type="hidden" name="companySlug" value={companySlug} />
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="assignmentId" value={row.assignment.id} />
                        <input type="hidden" name="evaluationId" value={evaluation.id} />
                        <input type="hidden" name="field" value={field} />
                        <input type="hidden" name="nextSigned" value={(!evaluation[field]).toString()} />
                        <button type="submit" className={`text-[10px] font-semibold ${evaluation[field] ? "text-sage-deep" : "text-ink-muted"} hover:underline`}>
                          {field === "evaluatorSigned" ? "Evaluator" : "Diketahui Technical Manager"}: {evaluation[field] ? "✓ Ditandatangani" : "Belum ditandatangani"}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {canManagePerformanceEvaluations && (
          <form action={createPerformanceEvaluation} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="assignmentId" value={row.assignment.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Evaluator (Ketua Tim/Technical Manager)</label>
              <select name="evaluatorEmployeeId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                <option value="">-- pilih --</option>
                {availableTeamCandidates.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Evaluasi</label>
              <DatePicker name="evaluationDate" required />
            </div>
            <div className="col-span-full grid grid-cols-2 sm:grid-cols-3 gap-4">
              {DEFAULT_PERFORMANCE_EVALUATION_ASPECTS.map((aspect, i) => (
                <div key={aspect}>
                  <label className="block text-[10px] font-semibold text-ink-muted mb-1">{aspect}</label>
                  <select name={`score_${i}`} required defaultValue="" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base">
                    <option value="" disabled>-- skor --</option>
                    {SCORE_SCALE.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="col-span-full">
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Catatan Kesimpulan (opsional)</label>
              <textarea autoComplete="off" name="conclusionNotes" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
            </div>
            <div className="col-span-full">
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)]">
                Simpan Evaluasi
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
