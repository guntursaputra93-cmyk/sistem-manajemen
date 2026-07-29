import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Check, X, AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, approvalFlows, approvalSteps, users } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getTerminology } from "@/lib/modules/terminology";
import {
  listEvaluations,
  getSeniorMinAssignments,
  computeEligibility,
  ELIGIBILITY_ENTITY_TYPE,
  ELIGIBILITY_JENIS_KEY,
  DEFAULT_SENIOR_MIN_ASSIGNMENTS,
  type FinalStatus,
  type ProposedStatus,
} from "@/lib/hr/practitionerEligibility";
import { selectableYears } from "@/lib/scheduling/witnessCompliance";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/FormField";
import {
  generateEvaluationsAction,
  submitForApprovalAction,
  decideEligibilityApprovalAction,
  updateEligibilitySettingsAction,
} from "./actions";

// AUDIT-E1 — evaluasi kelayakan tahunan personil. Label UI generik + getTerminology
// (pola AUDIT-E3), TIDAK hardcode "auditor".
const TERMINOLOGY_DEFAULTS = { personLabel: "Personil", assignmentLabel: "Penugasan" };

const PROPOSED_LABEL: Record<ProposedStatus, string> = {
  layak_senior: "Layak Senior",
  layak_junior: "Layak Junior",
  tidak_layak: "Tidak Layak",
};

const FINAL_LABEL: Record<FinalStatus, string> = {
  pending_review: "Menunggu Review",
  layak_senior: "Layak Senior",
  layak_junior: "Layak Junior",
  tidak_layak: "Tidak Layak",
  ditolak: "Ditolak Direktur",
};

const FINAL_VARIANT: Record<FinalStatus, BadgeVariant> = {
  pending_review: "powder-blue",
  layak_senior: "sage",
  layak_junior: "sage",
  tidak_layak: "dusty-rose",
  ditolak: "destructive",
};

function CriteriaMark({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[11.5px]">
      {ok ? <Check size={13} className="text-sage-deep" aria-hidden="true" />
          : <X size={13} className="text-destructive" aria-hidden="true" />}
      <span className={ok ? "text-ink" : "text-destructive"}>{ok ? "Ya" : "Tidak"}</span>
    </span>
  );
}

export default async function KelayakanPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ tahun?: string; error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  // RBAC lihat/generate: konsisten AUDIT-E3 — admin-only.
  if (!hasPermission(session.user.role, "MANAGE_EMPLOYEE_COMPETENCIES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) =>
    requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", companySlug })
  );

  const currentYear = new Date().getFullYear();
  const years = selectableYears(currentYear);
  const parsed = Number.parseInt(sp.tahun ?? "", 10);
  const year = years.includes(parsed) ? parsed : currentYear;

  const [evaluations, terminology, seniorMin, preview, flowRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) => listEvaluations(tx, { companyId: company.id, year })),
    withTenantContext(tenantContext, (tx) =>
      getTerminology(tx, { companyId: company.id, moduleKey: "sdm_kompetensi", defaults: TERMINOLOGY_DEFAULTS })
    ),
    withTenantContext(tenantContext, (tx) => getSeniorMinAssignments(tx, company.id)),
    withTenantContext(tenantContext, (tx) => computeEligibility(tx, { companyId: company.id, year })),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(approvalFlows).where(
        and(
          eq(approvalFlows.companyId, company.id),
          eq(approvalFlows.appliesTo, ELIGIBILITY_ENTITY_TYPE),
          eq(approvalFlows.jenisKey, ELIGIBILITY_JENIS_KEY)
        )
      ).orderBy(asc(approvalFlows.stepOrder))
    ),
  ]);

  const approvalConfigured = flowRows.length > 0;

  // Jenjang yang sedang menunggu keputusan, untuk menampilkan tombol approve/reject
  // hanya pada baris & step yang relevan.
  const stepRows = evaluations.length
    ? await withTenantContext(tenantContext, (tx) =>
        tx.select().from(approvalSteps).where(
          and(eq(approvalSteps.companyId, company.id), eq(approvalSteps.entityType, ELIGIBILITY_ENTITY_TYPE))
        )
      )
    : [];
  const [me] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(users).where(eq(users.id, session.user.id))
  );

  // Di-hoist keluar closure: TypeScript kehilangan narrowing `session != null`
  // begitu dipakai di dalam fungsi bersarang.
  const viewer = {
    id: session.user.id,
    role: session.user.role,
    departmentId: me?.departmentId ?? null,
  };

  function pendingStepFor(evaluationId: string): { stepOrder: number } | null {
    const mine = stepRows
      .filter((s) => s.entityId === evaluationId)
      .sort((a, b) => a.stepOrder - b.stepOrder);
    const firstPending = mine.find((s) => s.status === "pending");
    if (!firstPending) return null;
    const flow = flowRows.find((f) => f.stepOrder === firstPending.stepOrder);
    if (!flow) return null;
    // Cerminan isEligibleApprover() di flows.ts — hanya untuk menentukan apakah
    // tombol ditampilkan. Otorisasi SEBENARNYA tetap ditegakkan di server action.
    const eligible =
      viewer.role === "super_admin" ||
      (flow.requiredApproverUserId
        ? flow.requiredApproverUserId === viewer.id
        : flow.requiredRole === "department_head"
          ? viewer.role === "department_head" && viewer.departmentId != null && viewer.departmentId === firstPending.departmentId
          : viewer.role === flow.requiredRole);
    return eligible ? { stepOrder: firstPending.stepOrder } : null;
  }

  const person = terminology.personLabel;
  const cpdTargetHours = preview.cpdTargetHours;

  const columns: DataTableColumn<(typeof evaluations)[number]>[] = [
    {
      key: "nama",
      header: person,
      render: (r) => (
        <span>
          {r.employeeName}
          {r.positionTitle && <span className="block text-[11.5px] text-ink-muted">{r.positionTitle}</span>}
        </span>
      ),
    },
    {
      key: "penugasan",
      header: `${terminology.assignmentLabel} ${year}`,
      className: "text-right",
      render: (r) => (
        <span className="tabular-nums" title={`Ambang senior: ${seniorMin}`}>
          {r.assignmentCount}
        </span>
      ),
    },
    {
      key: "witness",
      header: "Pernah Di-witness",
      render: (r) => <CriteriaMark ok={r.everWitnessed} title="Kriteria gate: pernah di-witness kapan saja" />,
    },
    {
      key: "cpd",
      header: `CPD ${year}`,
      render: (r) => <CriteriaMark ok={r.cpdTargetMet} title="Kriteria gate: target CPD tahun ini terpenuhi" />,
    },
    {
      key: "usulan",
      header: "Usulan Sistem",
      render: (r) => <span className="text-[11.5px] text-ink-muted">{PROPOSED_LABEL[r.proposedStatus]}</span>,
    },
    {
      key: "final",
      header: "Status Final",
      render: (r) => (
        <div className="space-y-1">
          <Badge variant={FINAL_VARIANT[r.finalStatus]}>{FINAL_LABEL[r.finalStatus]}</Badge>
          {r.approvalSteps === 0 && (
            <span className="block text-[11px] text-ink-muted">belum ada jenjang approval</span>
          )}
        </div>
      ),
    },
    {
      key: "aksi",
      header: "Aksi",
      render: (r) => {
        const pending = pendingStepFor(r.id);
        return (
          <div className="flex flex-col gap-1.5">
            {r.approvalSteps === 0 && (
              <form action={submitForApprovalAction}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="evaluationId" value={r.id} />
                <input type="hidden" name="year" value={year} />
                <button type="submit" className="text-[11.5px] font-semibold text-sage-deep hover:underline cursor-pointer">
                  Ajukan Review
                </button>
              </form>
            )}
            {pending && (
              <div className="flex gap-2">
                {(["approved", "rejected"] as const).map((d) => (
                  <form key={d} action={decideEligibilityApprovalAction}>
                    <input type="hidden" name="companySlug" value={companySlug} />
                    <input type="hidden" name="evaluationId" value={r.id} />
                    <input type="hidden" name="year" value={year} />
                    <input type="hidden" name="stepOrder" value={pending.stepOrder} />
                    <input type="hidden" name="decision" value={d} />
                    <button
                      type="submit"
                      className={`text-[11.5px] font-semibold cursor-pointer hover:underline ${d === "approved" ? "text-sage-deep" : "text-destructive"}`}
                    >
                      {d === "approved" ? "Setujui" : "Tolak"}
                    </button>
                  </form>
                ))}
              </div>
            )}
            {r.approvalSteps > 0 && !pending && <span className="text-[11.5px] text-ink-muted">—</span>}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "SDM" },
          { label: "Kompetensi", href: `/${companySlug}/sdm/kompetensi` },
          { label: "Evaluasi Kelayakan" },
        ]}
        title="Evaluasi Kelayakan Tahunan"
        description={`Penilaian kelayakan ${person.toLowerCase()} ${year} dari 3 kriteria. Status final ditetapkan Direktur lewat jenjang approval.`}
      />

      {sp.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{sp.error}</div>
      )}
      {sp.success && (
        <div className="rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">Berhasil disimpan.</div>
      )}

      {!approvalConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            <strong>Jenjang approval belum dikonfigurasi</strong> untuk evaluasi kelayakan. Selama belum diatur,
            status final SEMUA evaluasi tetap <em>Menunggu Review</em> dan tidak akan pernah menjadi layak —
            ini disengaja agar tidak ada {person.toLowerCase()} yang dinyatakan layak tanpa ditinjau Direktur.
            Atur di <strong>Pengaturan &rsaquo; Jenjang Approval</strong> (jenis <code>{ELIGIBILITY_JENIS_KEY}</code>).
          </span>
        </div>
      )}

      {cpdTargetHours === null && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <span>
            <strong>Target CPD tahunan belum diatur.</strong> Kriteria CPD tidak dapat diverifikasi sehingga
            dianggap TIDAK terpenuhi — akibatnya semua usulan menjadi &quot;Tidak Layak&quot;. Atur target di
            halaman <strong>SDM &rsaquo; CPD</strong> lebih dulu.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Filter & Generate">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Tahun</label>
              <select name="tahun" defaultValue={String(year)} className={inputClass}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="submit" className="rounded-[10px] border border-ink-muted/20 px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 cursor-pointer">
              Tampilkan
            </button>
          </form>
          <form action={generateEvaluationsAction} className="mt-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="year" value={year} />
            <button type="submit" className="bg-peach-deep hover:bg-peach-deep/90 text-white text-[13px] font-bold px-4 py-2 rounded-[10px] transition-colors cursor-pointer">
              Generate / Hitung Ulang {year}
            </button>
            <p className="mt-2 text-[11.5px] text-ink-muted">
              Menghitung ulang ketiga kriteria dari data terbaru dan menyimpannya sebagai snapshot.
              Evaluasi yang sudah diputuskan Direktur tidak ditimpa.
            </p>
          </form>
        </Card>

        <Card title="Ambang Batas Senior" description={`Berlaku untuk ${company.name}.`}>
          <form action={updateEligibilitySettingsAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">
                Minimum {terminology.assignmentLabel.toLowerCase()} untuk Layak Senior
              </label>
              <input
                autoComplete="off"
                name="seniorMinAssignments"
                type="number"
                min={1}
                step={1}
                defaultValue={seniorMin}
                className={inputClass}
              />
            </div>
            <button type="submit" className="rounded-[10px] border border-ink-muted/20 px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5 cursor-pointer">
              Simpan
            </button>
          </form>
          <p className="mt-2 text-[11.5px] text-ink-muted">
            Kosongkan untuk kembali ke default ({DEFAULT_SENIOR_MIN_ASSIGNMENTS}). Ambang batas boleh berbeda
            tiap perusahaan karena jenis jasanya berbeda.
          </p>
        </Card>
      </div>

      <Card
        title={`Evaluasi ${year}`}
        description={`${evaluations.length} evaluasi tersimpan · populasi terkini ${preview.rows.length} ${person.toLowerCase()} berkompetensi · ambang senior ${seniorMin}`}
      >
        {evaluations.length === 0 ? (
          <EmptyState message={`Belum ada evaluasi ${year}. Klik "Generate / Hitung Ulang" untuk membuatnya dari data terkini.`} />
        ) : (
          <DataTable columns={columns} rows={evaluations} rowKey={(r) => r.id} emptyMessage="Tidak ada data." />
        )}
      </Card>

      <p className="text-[11.5px] text-ink-muted">
        Aturan: gagal pada <em>pernah di-witness</em> ATAU <em>target CPD</em> &rarr; Tidak Layak, berapa pun
        jumlah {terminology.assignmentLabel.toLowerCase()}-nya. Lolos keduanya &rarr; Layak Senior bila
        {" "}{terminology.assignmentLabel.toLowerCase()} &ge; {seniorMin}, selain itu Layak Junior. Status final
        selalu melalui persetujuan Direktur.
      </p>
    </div>
  );
}
