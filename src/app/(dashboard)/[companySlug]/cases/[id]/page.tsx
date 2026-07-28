import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import {
  companies,
  cases,
  caseStageHistory,
  caseServiceAssignments,
  organizations,
  users,
  opportunities,
  contracts,
  serviceAssignments,
  serviceAssignmentTeam,
  employees,
  activities,
  attachments,
  arInvoices,
  arPayments,
  caseExternalSubmissionHistory,
} from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { listMilestonesByCase, listDeliverablesByCase, listExternalSubmissionsByCase } from "@/lib/cases/cases";
import {
  updateCaseStageAction,
  linkOpportunityAction,
  linkContractAction,
  linkServiceAssignmentAction,
  createMilestoneAction,
  completeMilestoneAction,
  deleteMilestoneAction,
  createDeliverableAction,
  updateDeliverableAction,
  createExternalSubmissionAction,
  updateSubmissionStatusAction,
} from "../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormField, inputClass } from "@/components/ui/FormField";
import { DatePicker } from "@/components/ui/DatePicker";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { AttachmentUploader } from "@/components/attachments/AttachmentUploader";

const DELIVERABLE_STATUS = ["draft", "aktif", "kadaluarsa", "dicabut"];
const SUBMISSION_STATUS = ["draft", "diajukan", "diproses", "revisi", "disetujui", "terbit", "ditolak"];

// 8 tahap utama (progress). closed/cancelled bukan bagian progress bar.
const STAGE_MAIN: { key: string; label: string }[] = [
  { key: "intake", label: "Intake" },
  { key: "penawaran", label: "Penawaran" },
  { key: "kontrak", label: "Kontrak" },
  { key: "penugasan", label: "Penugasan" },
  { key: "pelaksanaan", label: "Pelaksanaan" },
  { key: "review", label: "Review" },
  { key: "delivery", label: "Delivery" },
];
const STAGE_ALL: { key: string; label: string }[] = [
  ...STAGE_MAIN,
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
];
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGE_ALL.map((s) => [s.key, s.label]));

const CASE_STATUS_LABEL: Record<string, string> = { aktif: "Aktif", on_hold: "On Hold", selesai: "Selesai", batal: "Batal" };
const CASE_STATUS_VARIANT: Record<string, BadgeVariant> = { aktif: "sage", on_hold: "powder-blue", selesai: "dusty-rose", batal: "destructive" };

// Badge status generik untuk kolom text bebas (milestone/deliverable/submission/invoice).
function textStatusVariant(s: string): BadgeVariant {
  if (["done", "aktif", "selesai", "lunas", "disetujui", "terbit"].includes(s)) return "sage";
  if (["blocked", "batal", "dicabut", "ditolak", "kadaluarsa", "jatuh_tempo"].includes(s)) return "destructive";
  if (["in_progress", "diproses", "diajukan", "sebagian", "revisi", "on_hold", "belum_dibayar"].includes(s)) return "powder-blue";
  return "dusty-rose";
}

const rupiah = (v: string | number) => `Rp ${Number(v).toLocaleString("id-ID")}`;

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; success?: string; linked?: string }>;
}) {
  const { companySlug, id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_CASES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "case_management", companySlug }));

  const [row] = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ c: cases, organizationName: organizations.name, picUserName: users.fullName })
      .from(cases)
      .leftJoin(organizations, eq(organizations.id, cases.organizationId))
      .leftJoin(users, eq(users.id, cases.picUserId))
      .where(and(eq(cases.id, id), eq(cases.companyId, company.id))),
  );
  if (!row) notFound();
  const kase = row.c;

  // Visibilitas per-baris (sama pola board): staff hanya case-nya sendiri.
  if (session.user.role === "staff" && kase.picUserId !== session.user.id && kase.createdBy !== session.user.id) {
    redirect(`/${companySlug}/cases?error=${encodeURIComponent("Tidak punya izin melihat case ini.")}`);
  }

  const canManage = hasPermission(session.user.role, "MANAGE_CASES");
  const canViewFinance = hasPermission(session.user.role, "VIEW_AR_INVOICES");
  const canViewAudit = hasPermission(session.user.role, "VIEW_AUDIT_TRAIL");
  const activeTab = sp.tab ?? "overview";

  const tabDefs = [
    { value: "overview", label: "Overview" },
    { value: "timeline", label: "Timeline" },
    { value: "tim", label: "Tim" },
    { value: "dokumen", label: "Dokumen" },
    ...(canViewFinance ? [{ value: "keuangan", label: "Keuangan" }] : []),
    { value: "eksternal", label: "Sertifikasi & Eksternal" },
  ];
  const tab = tabDefs.some((t) => t.value === activeTab) ? activeTab : "overview";
  const currentOrd = STAGE_MAIN.findIndex((s) => s.key === kase.currentStage);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={[{ label: "Case Management" }, { label: "Case Board", href: `/${companySlug}/cases` }, { label: kase.caseNumber ?? "Case" }]}
        title={kase.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[12px]">{kase.caseNumber ?? "—"}</span>
            <Badge variant="powder-blue">{STAGE_LABEL[kase.currentStage] ?? kase.currentStage}</Badge>
            <Badge variant={CASE_STATUS_VARIANT[kase.status] ?? "powder-blue"}>{CASE_STATUS_LABEL[kase.status] ?? kase.status}</Badge>
          </span>
        }
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Link
                href={`/${companySlug}/cases/${kase.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-ink-muted/20 bg-transparent px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink-muted/5"
              >
                Edit
              </Link>
              <FormDrawer buttonLabel="Ubah Tahap" title="Ubah Tahap Manual" description="Override tahap case. Alasan wajib diisi & tercatat di Timeline.">
                <form action={updateCaseStageAction}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="caseId" value={kase.id} />
                  <FormField label="Tahap Tujuan *" full>
                    <select name="targetStage" defaultValue={kase.currentStage} required className={inputClass}>
                      {STAGE_ALL.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Alasan Perubahan *" full>
                    <textarea name="notes" required rows={3} className={inputClass} />
                  </FormField>
                  <DrawerFooter submitLabel="Simpan Tahap" />
                </form>
              </FormDrawer>
            </div>
          )
        }
      />

      {sp.error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{sp.error}</div>}
      {sp.linked && (
        <div className="rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">
          {sp.linked === "opportunity" ? "Opportunity" : sp.linked === "contract" ? "Contract" : "Penugasan"} berhasil ditautkan. Penautan otomatis memajukan tahap bila sesuai — tahap case sekarang:{" "}
          <Badge variant="powder-blue">{STAGE_LABEL[kase.currentStage] ?? kase.currentStage}</Badge>
        </div>
      )}
      {sp.success && !sp.linked && <div className="rounded-lg border border-sage-deep/20 bg-sage/20 px-4 py-3 text-[13px] text-ink">Berhasil disimpan.</div>}

      <Card title="Ringkasan">
        <dl className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">Klien</dt>
            <dd className="text-ink">{row.organizationName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">PIC</dt>
            <dd className="text-ink">{row.picUserName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Dibuka</dt>
            <dd className="text-ink">{kase.openedAt}</dd>
          </div>
        </dl>
      </Card>

      <Tabs value={tab} tabs={tabDefs.map((t) => ({ value: t.value, label: t.label, href: `/${companySlug}/cases/${kase.id}?tab=${t.value}` }))} />

      {tab === "overview" && (await OverviewTab({ tenantContext, companyId: company.id, companySlug, kase, currentOrd, canManage }))}
      {tab === "timeline" && (await TimelineTab({ tenantContext, companyId: company.id, companySlug, caseId: kase.id, caseCreatedAt: kase.createdAt, canViewAudit }))}
      {tab === "tim" && (await TimTab({ tenantContext, companyId: company.id, companySlug, caseId: kase.id }))}
      {tab === "dokumen" && (await DokumenTab({ tenantContext, companyId: company.id, caseId: kase.id }))}
      {tab === "keuangan" && canViewFinance && (await KeuanganTab({ tenantContext, companyId: company.id, companySlug, contractId: kase.contractId }))}
      {tab === "eksternal" && (await EksternalTab({ tenantContext, companyId: company.id, companySlug, caseId: kase.id, canManage }))}
    </div>
  );
}

type Ctx = { tenantContext: { role: string; companyId: string }; companyId: string };

async function OverviewTab({ tenantContext, companyId, companySlug, kase, currentOrd, canManage }: Ctx & { companySlug: string; kase: typeof cases.$inferSelect; currentOrd: number; canManage: boolean }) {
  const wantLinkOpp = canManage && !kase.opportunityId;
  const wantLinkContract = canManage && !kase.contractId;

  const [opp, contract, milestones, oppCandidates, contractCandidates, linkedAsgRows, asgCandRows] = await Promise.all([
    kase.opportunityId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(and(eq(opportunities.id, kase.opportunityId!), eq(opportunities.companyId, companyId)))).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    kase.contractId
      ? withTenantContext(tenantContext, (tx) => tx.select().from(contracts).where(and(eq(contracts.id, kase.contractId!), eq(contracts.companyId, companyId)))).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    withTenantContext(tenantContext, (tx) => listMilestonesByCase(tx, { companyId, caseId: kase.id })),
    // Kandidat link difilter organisasi SAMA dgn case (UX: cegah pilih yg akan ditolak server).
    wantLinkOpp
      ? withTenantContext(tenantContext, (tx) => tx.select({ id: opportunities.id, title: opportunities.title }).from(opportunities).where(and(eq(opportunities.companyId, companyId), eq(opportunities.organizationId, kase.organizationId))).orderBy(desc(opportunities.createdAt)))
      : Promise.resolve([] as { id: string; title: string }[]),
    wantLinkContract
      ? withTenantContext(tenantContext, (tx) => tx.select({ id: contracts.id, contractValue: contracts.contractValue, startDate: contracts.startDate }).from(contracts).where(and(eq(contracts.companyId, companyId), eq(contracts.organizationId, kase.organizationId))).orderBy(desc(contracts.createdAt)))
      : Promise.resolve([] as { id: string; contractValue: string; startDate: string }[]),
    canManage
      ? withTenantContext(tenantContext, (tx) => tx.select({ assignmentId: caseServiceAssignments.assignmentId }).from(caseServiceAssignments).where(and(eq(caseServiceAssignments.caseId, kase.id), eq(caseServiceAssignments.companyId, companyId))))
      : Promise.resolve([] as { assignmentId: string }[]),
    canManage
      ? withTenantContext(tenantContext, (tx) =>
          tx
            .select({ id: serviceAssignments.id, assignmentDate: serviceAssignments.assignmentDate })
            .from(serviceAssignments)
            .innerJoin(contracts, eq(contracts.id, serviceAssignments.contractId))
            .where(and(eq(serviceAssignments.companyId, companyId), eq(contracts.organizationId, kase.organizationId)))
            .orderBy(desc(serviceAssignments.assignmentDate)),
        )
      : Promise.resolve([] as { id: string; assignmentDate: string }[]),
  ]);

  const linkedAsgIds = new Set(linkedAsgRows.map((r) => r.assignmentId));
  const assignmentCandidates = asgCandRows.filter((a) => !linkedAsgIds.has(a.id));

  const isTerminal = kase.currentStage === "closed" || kase.currentStage === "cancelled";

  const hiddenInputs = (
    <>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="caseId" value={kase.id} />
    </>
  );

  return (
    <div className="space-y-5">
      <Card title="Progress Tahap">
        {isTerminal ? (
          <p className="text-[13px] text-ink-muted">
            Case berada di tahap terminal: <Badge variant={kase.currentStage === "closed" ? "sage" : "destructive"}>{STAGE_LABEL[kase.currentStage]}</Badge>
          </p>
        ) : (
          <div className="flex items-end gap-1.5">
            {STAGE_MAIN.map((s, i) => {
              const passed = currentOrd >= 0 && i <= currentOrd;
              return (
                <div key={s.key} className="flex-1">
                  <div className={`h-1.5 rounded-full ${passed ? "bg-sage-deep" : "bg-ink-muted/15"}`} />
                  <span className={`mt-1 block text-center text-[10px] leading-tight ${i === currentOrd ? "font-bold text-ink" : "text-ink-muted"}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Opportunity Tertaut">
          {opp ? (
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Judul</dt>
                <dd className="text-right">
                  <Link href={`/${companySlug}/crm/opportunities/${opp.id}`} className="font-medium text-sage-deep hover:underline">
                    {opp.title}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Estimasi Nilai</dt>
                <dd className="text-ink">{opp.estimatedValue ? rupiah(opp.estimatedValue) : "-"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Badge variant={textStatusVariant(opp.status)}>{opp.status}</Badge>
                </dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] italic text-ink-muted">Belum ada opportunity tertaut.</p>
              {wantLinkOpp && oppCandidates.length > 0 && (
                <FormDrawer buttonLabel="Tautkan Opportunity" title="Tautkan Opportunity" description="Hanya opportunity milik klien yang sama. Menautkan otomatis memajukan tahap ke Penawaran bila case masih di Intake.">
                  <form action={linkOpportunityAction}>
                    {hiddenInputs}
                    <FormField label="Opportunity *" full>
                      <select name="opportunityId" required defaultValue="" className={inputClass}>
                        <option value="" disabled>
                          -- pilih --
                        </option>
                        {oppCandidates.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.title}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <DrawerFooter submitLabel="Tautkan" />
                  </form>
                </FormDrawer>
              )}
              {wantLinkOpp && oppCandidates.length === 0 && <p className="text-[11px] text-ink-muted/70">Tidak ada opportunity klien ini untuk ditautkan.</p>}
            </div>
          )}
        </Card>

        <Card title="Contract Tertaut">
          {contract ? (
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Nilai Kontrak</dt>
                <dd className="text-right">
                  <Link href={`/${companySlug}/crm/contracts/${contract.id}`} className="font-medium text-sage-deep hover:underline">
                    {rupiah(contract.contractValue)}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Status Pembayaran</dt>
                <dd>
                  <Badge variant={textStatusVariant(contract.paymentStatus)}>{contract.paymentStatus}</Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Mulai</dt>
                <dd className="text-ink">{contract.startDate}</dd>
              </div>
            </dl>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] italic text-ink-muted">Belum ada contract tertaut.</p>
              {wantLinkContract && contractCandidates.length > 0 && (
                <FormDrawer buttonLabel="Tautkan Contract" title="Tautkan Contract" description="Hanya contract milik klien yang sama. Menautkan otomatis memajukan tahap ke Kontrak bila case masih di tahap lebih awal.">
                  <form action={linkContractAction}>
                    {hiddenInputs}
                    <FormField label="Contract *" full>
                      <select name="contractId" required defaultValue="" className={inputClass}>
                        <option value="" disabled>
                          -- pilih --
                        </option>
                        {contractCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {rupiah(c.contractValue)} — mulai {c.startDate}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <DrawerFooter submitLabel="Tautkan" />
                  </form>
                </FormDrawer>
              )}
              {wantLinkContract && contractCandidates.length === 0 && <p className="text-[11px] text-ink-muted/70">Tidak ada contract klien ini untuk ditautkan.</p>}
            </div>
          )}
        </Card>
      </div>

      {canManage && (
        <Card title="Tautkan Penugasan" description="Kaitkan service assignment (klien sama) ke case. Menautkan otomatis memajukan tahap ke Penugasan bila case masih di tahap lebih awal.">
          {assignmentCandidates.length === 0 ? (
            <p className="text-[13px] italic text-ink-muted">Tidak ada penugasan klien ini yang belum tertaut. Buat/tautkan lewat modul Penjadwalan.</p>
          ) : (
            <FormDrawer buttonLabel="Tautkan Penugasan" title="Tautkan Penugasan" description="Menautkan otomatis memajukan tahap ke Penugasan bila case masih di tahap lebih awal.">
              <form action={linkServiceAssignmentAction}>
                {hiddenInputs}
                <FormField label="Penugasan *" full>
                  <select name="assignmentId" required defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      -- pilih --
                    </option>
                    {assignmentCandidates.map((a) => (
                      <option key={a.id} value={a.id}>
                        Penugasan {a.assignmentDate}
                      </option>
                    ))}
                  </select>
                </FormField>
                <DrawerFooter submitLabel="Tautkan" />
              </form>
            </FormDrawer>
          )}
        </Card>
      )}

      <Card
        title={`Milestone (${milestones.length})`}
        description="Checklist per case."
        action={
          canManage && (
            <FormDrawer buttonLabel="Tambah Milestone" title="Tambah Milestone">
              <form action={createMilestoneAction}>
                {hiddenInputs}
                <FormField label="Judul *" full>
                  <input autoComplete="off" name="title" required className={inputClass} />
                </FormField>
                <FormField label="Key *" full>
                  <input autoComplete="off" name="milestoneKey" required className={inputClass} placeholder="mis. dp_diterima" />
                </FormField>
                <FormField label="Jatuh Tempo">
                  <DatePicker name="dueDate" />
                </FormField>
                <DrawerFooter submitLabel="Tambah Milestone" />
              </form>
            </FormDrawer>
          )
        }
      >
        {milestones.length === 0 ? (
          <p className="text-[13px] italic text-ink-muted">Belum ada milestone.</p>
        ) : (
          <ul className="space-y-1.5">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={m.status === "done" ? "text-sage-deep" : "text-ink-muted"}>{m.status === "done" ? "☑" : "☐"}</span>
                  <span className="text-ink">{m.title}</span>
                  {m.dueDate && <span className="text-[11px] text-ink-muted">jatuh tempo {m.dueDate}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <Badge variant={textStatusVariant(m.status)}>{m.status}</Badge>
                  {canManage && m.status !== "done" && (
                    <form action={completeMilestoneAction}>
                      {hiddenInputs}
                      <input type="hidden" name="milestoneId" value={m.id} />
                      <button type="submit" className="text-[11px] font-semibold text-sage-deep hover:underline">
                        Tandai selesai
                      </button>
                    </form>
                  )}
                  {canManage && (
                    <form action={deleteMilestoneAction}>
                      {hiddenInputs}
                      <input type="hidden" name="milestoneId" value={m.id} />
                      <ConfirmButton confirmText={`Hapus milestone "${m.title}"?`} className="text-[11px] font-semibold text-destructive hover:underline">
                        Hapus
                      </ConfirmButton>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function TimelineTab({
  tenantContext,
  companyId,
  companySlug,
  caseId,
  caseCreatedAt,
  canViewAudit,
}: Ctx & { caseId: string; companySlug: string; caseCreatedAt: Date; canViewAudit: boolean }) {
  const [stageRows, actRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ h: caseStageHistory, changedByName: users.fullName })
        .from(caseStageHistory)
        .leftJoin(users, eq(users.id, caseStageHistory.changedBy))
        .where(and(eq(caseStageHistory.caseId, caseId), eq(caseStageHistory.companyId, companyId))),
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(activities).where(and(eq(activities.caseId, caseId), eq(activities.companyId, companyId)))),
  ]);

  type Ev = { at: Date; node: React.ReactNode };
  const events: Ev[] = [
    ...stageRows.map((r) => ({
      at: r.h.changedAt,
      node: (
        <div className="flex items-start gap-3">
          <Badge variant={r.h.changedBy === null ? "powder-blue" : "sage"}>{r.h.changedBy === null ? "Otomatis" : "Manual"}</Badge>
          <div className="min-w-0">
            <p className="text-[13px] text-ink">
              {r.h.fromStage ? `${STAGE_LABEL[r.h.fromStage] ?? r.h.fromStage} → ` : ""}
              <span className="font-semibold">{STAGE_LABEL[r.h.toStage] ?? r.h.toStage}</span>
            </p>
            {r.h.notes && <p className="text-[12px] text-ink-muted">{r.h.notes}</p>}
            <p className="text-[11px] text-ink-muted/70">
              {r.changedByName ? `oleh ${r.changedByName} · ` : ""}
              {new Date(r.h.changedAt).toLocaleString("id-ID")}
            </p>
          </div>
        </div>
      ),
    })),
    ...actRows.map((a) => ({
      at: a.createdAt,
      node: (
        <div className="flex items-start gap-3">
          <Badge variant="dusty-rose">Aktivitas</Badge>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">{a.activityType}</p>
            {a.notes && <p className="text-[12px] text-ink-muted">{a.notes}</p>}
            <p className="text-[11px] text-ink-muted/70">{a.activityDate}</p>
          </div>
        </div>
      ),
    })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime()); // terbaru di atas

  // Rentangnya sengaja dari tanggal case dibuat s/d hari ini — kalau memakai
  // default 30 hari, case yang lebih tua akan tampil kosong dan terlihat seperti
  // tidak punya jejak sama sekali.
  const auditHref =
    `/${companySlug}/pengaturan/audit-trail` +
    `?entityId=${caseId}&from=${caseCreatedAt.toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`;

  return (
    <Card
      title="Timeline"
      action={
        // Timeline ini ringkasan untuk layar; laporan audit trail adalah versi
        // lengkap yang bisa diekspor PDF/Excel untuk pihak luar. Hanya admin.
        canViewAudit ? (
          <Link href={auditHref} className="text-[11.5px] font-bold text-sage-deep hover:underline">
            Laporan audit lengkap &rarr;
          </Link>
        ) : undefined
      }
    >
      {events.length === 0 ? (
        <p className="text-[13px] italic text-ink-muted">Belum ada riwayat.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-ink-muted/10 pl-4">
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-ink-muted/30" />
              {e.node}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function TimTab({ tenantContext, companyId, companySlug, caseId }: Ctx & { companySlug: string; caseId: string }) {
  const asgRows = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ a: serviceAssignments, mainEmployee: employees.fullName })
      .from(caseServiceAssignments)
      .innerJoin(serviceAssignments, eq(serviceAssignments.id, caseServiceAssignments.assignmentId))
      .leftJoin(employees, eq(employees.id, serviceAssignments.employeeId))
      .where(and(eq(caseServiceAssignments.caseId, caseId), eq(caseServiceAssignments.companyId, companyId))),
  );

  const asgIds = asgRows.map((r) => r.a.id);
  const teamRows = asgIds.length
    ? await withTenantContext(tenantContext, (tx) =>
        tx
          .select({ t: serviceAssignmentTeam, memberName: employees.fullName })
          .from(serviceAssignmentTeam)
          .leftJoin(employees, eq(employees.id, serviceAssignmentTeam.employeeId))
          .where(and(inArray(serviceAssignmentTeam.assignmentId, asgIds), eq(serviceAssignmentTeam.companyId, companyId))),
      )
    : [];

  if (asgRows.length === 0) {
    return <EmptyState message="Belum ada penugasan tertaut ke case ini. Tautkan penugasan lewat modul Penjadwalan / aksi link." />;
  }

  return (
    <div className="space-y-4">
      {asgRows.map(({ a, mainEmployee }) => {
        const team = teamRows.filter((r) => r.t.assignmentId === a.id);
        return (
          <Card
            key={a.id}
            title={`Penugasan ${a.assignmentDate}`}
            action={
              <Link href={`/${companySlug}/penjadwalan/${a.id}`} className="text-[12px] font-semibold text-sage-deep hover:underline">
                Buka di Penjadwalan →
              </Link>
            }
          >
            <dl className="mb-2 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
              <div>
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Badge variant={textStatusVariant(a.status)}>{a.status}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Personil Utama</dt>
                <dd className="text-ink">{mainEmployee ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Lokasi</dt>
                <dd className="text-ink">{a.location ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Selesai</dt>
                <dd className="text-ink">{a.endDate ?? "-"}</dd>
              </div>
            </dl>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Tim Tambahan</p>
            {team.length === 0 ? (
              <p className="text-[12px] italic text-ink-muted">Tidak ada anggota tim tambahan.</p>
            ) : (
              <ul className="text-[13px] text-ink">
                {team.map((r) => (
                  <li key={r.t.id}>
                    {r.memberName ?? "-"} {r.t.roleInTeam ? <span className="text-ink-muted">— {r.t.roleInTeam}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function DokumenTab({ tenantContext, companyId, caseId }: Ctx & { caseId: string }) {
  const atts = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(attachments)
      .where(and(eq(attachments.companyId, companyId), eq(attachments.entityType, "case"), eq(attachments.entityId, caseId)))
      .orderBy(desc(attachments.uploadedAt)),
  );

  return (
    <Card title="Dokumen Case" description="Lampiran PDF terkait case ini.">
      <AttachmentUploader
        entityType="case"
        entityId={caseId}
        attachments={atts.map((a) => ({ id: a.id, fileName: a.fileName, fileSize: a.fileSize, uploadedAt: a.uploadedAt }))}
      />
    </Card>
  );
}

async function KeuanganTab({ tenantContext, companyId, companySlug, contractId }: Ctx & { companySlug: string; contractId: string | null }) {
  if (!contractId) {
    return <EmptyState message="Case belum tertaut ke contract, jadi belum ada data keuangan. Tautkan contract dulu." />;
  }

  const invoices = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(arInvoices).where(and(eq(arInvoices.contractId, contractId), eq(arInvoices.companyId, companyId))).orderBy(desc(arInvoices.invoiceDate)),
  );
  const invIds = invoices.map((i) => i.id);
  const payments = invIds.length
    ? await withTenantContext(tenantContext, (tx) => tx.select().from(arPayments).where(and(inArray(arPayments.invoiceId, invIds), eq(arPayments.companyId, companyId))))
    : [];

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

  if (invoices.length === 0) {
    return <EmptyState message="Belum ada invoice untuk contract case ini. Invoice dibuat lewat modul Piutang (AR)." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Card title="Total Ditagih">
          <p className="text-[16px] font-bold text-ink">{rupiah(totalInvoiced)}</p>
        </Card>
        <Card title="Total Dibayar">
          <p className="text-[16px] font-bold text-ink">{rupiah(totalPaid)}</p>
        </Card>
      </div>
      <Card title="Daftar Invoice">
        <ul className="divide-y divide-ink-muted/10">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <div className="min-w-0">
                <Link href={`/${companySlug}/keuangan/piutang/${inv.id}`} className="font-mono font-medium text-sage-deep hover:underline">
                  {inv.invoiceNumber ?? "(draft)"}
                </Link>
                <span className="ml-2 text-ink-muted">{inv.invoiceDate}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-ink">{rupiah(inv.amount)}</span>
                <Badge variant={textStatusVariant(inv.status)}>{inv.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function EksternalTab({ tenantContext, companyId, companySlug, caseId, canManage }: Ctx & { companySlug: string; caseId: string; canManage: boolean }) {
  const [deliverables, submissions] = await Promise.all([
    withTenantContext(tenantContext, (tx) => listDeliverablesByCase(tx, { companyId, caseId })),
    withTenantContext(tenantContext, (tx) => listExternalSubmissionsByCase(tx, { companyId, caseId })),
  ]);

  const subIds = submissions.map((s) => s.submission.id);
  const histories = subIds.length
    ? await withTenantContext(tenantContext, (tx) =>
        tx
          .select()
          .from(caseExternalSubmissionHistory)
          .where(and(inArray(caseExternalSubmissionHistory.submissionId, subIds), eq(caseExternalSubmissionHistory.companyId, companyId)))
          .orderBy(asc(caseExternalSubmissionHistory.reportedAt)),
      )
    : [];

  const hiddenInputs = (
    <>
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="caseId" value={caseId} />
    </>
  );

  return (
    <div className="space-y-5">
      <Card
        title={`Deliverable (${deliverables.length})`}
        description="Hasil akhir ke klien (sertifikat/laporan/dokumen)."
        action={
          canManage && (
            <FormDrawer buttonLabel="Tambah Deliverable" title="Tambah Deliverable">
              <form action={createDeliverableAction}>
                {hiddenInputs}
                <FormField label="Jenis Deliverable *" full>
                  <input autoComplete="off" name="deliverableType" required className={inputClass} placeholder="mis. ISO 9001, SMK3, Sertifikat Kompetensi" />
                </FormField>
                <FormField label="Nomor (opsional)">
                  <input autoComplete="off" name="deliverableNumber" className={inputClass} />
                </FormField>
                <FormField label="Tanggal Terbit">
                  <DatePicker name="issuedDate" />
                </FormField>
                <FormField label="Berlaku s/d">
                  <DatePicker name="validUntil" />
                </FormField>
                <DrawerFooter submitLabel="Tambah Deliverable" />
              </form>
            </FormDrawer>
          )
        }
      >
        {deliverables.length === 0 ? (
          <p className="text-[13px] italic text-ink-muted">Belum ada deliverable.</p>
        ) : (
          <ul className="divide-y divide-ink-muted/10">
            {deliverables.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{d.deliverableType}</span>
                  {d.deliverableNumber && <span className="ml-2 font-mono text-[12px] text-ink-muted">{d.deliverableNumber}</span>}
                  <p className="text-[11px] text-ink-muted">
                    {d.issuedDate ? `Terbit ${d.issuedDate}` : "Belum terbit"}
                    {d.validUntil ? ` · Berlaku s/d ${d.validUntil}` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2.5">
                  <Badge variant={textStatusVariant(d.status)}>{d.status}</Badge>
                  {canManage && (
                    <FormDrawer buttonLabel="Edit" title={`Edit Deliverable`}>
                      <form action={updateDeliverableAction}>
                        {hiddenInputs}
                        <input type="hidden" name="deliverableId" value={d.id} />
                        <FormField label="Jenis Deliverable *" full>
                          <input autoComplete="off" name="deliverableType" required defaultValue={d.deliverableType} className={inputClass} />
                        </FormField>
                        <FormField label="Nomor">
                          <input autoComplete="off" name="deliverableNumber" defaultValue={d.deliverableNumber ?? ""} className={inputClass} />
                        </FormField>
                        <FormField label="Barcode">
                          <input autoComplete="off" name="barcodeValue" defaultValue={d.barcodeValue ?? ""} className={inputClass} />
                        </FormField>
                        <FormField label="Status *">
                          <select name="status" required defaultValue={d.status} className={inputClass}>
                            {DELIVERABLE_STATUS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </FormField>
                        <FormField label="Tanggal Terbit">
                          <DatePicker name="issuedDate" defaultValue={d.issuedDate} />
                        </FormField>
                        <FormField label="Berlaku s/d">
                          <DatePicker name="validUntil" defaultValue={d.validUntil} />
                        </FormField>
                        <DrawerFooter submitLabel="Simpan Deliverable" />
                      </form>
                    </FormDrawer>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={`Pengajuan Eksternal (${submissions.length})`}
        description="Riwayat proses ke pihak luar. Klik tiap pengajuan untuk lihat timeline status."
        action={
          canManage && (
            <FormDrawer buttonLabel="Buat Pengajuan Baru" title="Buat Pengajuan Eksternal">
              <form action={createExternalSubmissionAction}>
                {hiddenInputs}
                <FormField label="Nama Pihak Luar *" full>
                  <input autoComplete="off" name="externalPartyName" required className={inputClass} placeholder="mis. Kemenaker, BNSP" />
                </FormField>
                <FormField label="Jenis Pengajuan">
                  <input autoComplete="off" name="submissionType" className={inputClass} />
                </FormField>
                <FormField label="Nomor Tracking">
                  <input autoComplete="off" name="trackingNumber" className={inputClass} />
                </FormField>
                <DrawerFooter submitLabel="Buat Pengajuan" />
              </form>
            </FormDrawer>
          )
        }
      >
        {submissions.length === 0 ? (
          <p className="text-[13px] italic text-ink-muted">Belum ada pengajuan eksternal.</p>
        ) : (
          <div className="space-y-2">
            {submissions.map(({ submission: s }) => {
              const hist = histories.filter((h) => h.submissionId === s.id);
              return (
                <details key={s.id} className="rounded-[12px] border border-ink-muted/12 px-3 py-2">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{s.externalPartyName}</span>
                      {s.submissionType && <span className="ml-2 text-ink-muted">{s.submissionType}</span>}
                      {s.trackingNumber && <span className="ml-2 font-mono text-[11px] text-ink-muted">#{s.trackingNumber}</span>}
                    </span>
                    <Badge variant={textStatusVariant(s.status)}>{s.status}</Badge>
                  </summary>
                  <ol className="mt-2 space-y-2 border-l-2 border-ink-muted/10 pl-3">
                    {hist.map((h) => (
                      <li key={h.id} className="text-[12px]">
                        <span className="font-medium text-ink">{h.status}</span>
                        {h.notes && <span className="text-ink-muted"> — {h.notes}</span>}
                        <span className="block text-[11px] text-ink-muted/70">{new Date(h.reportedAt).toLocaleString("id-ID")}</span>
                      </li>
                    ))}
                  </ol>
                  {canManage && (
                    <div className="mt-3">
                      <FormDrawer buttonLabel="Update Status" title={`Update Status — ${s.externalPartyName}`} description="Catat status terbaru pengajuan. Keterangan WAJIB diisi (jadi entry laporan di timeline).">
                        <form action={updateSubmissionStatusAction}>
                          {hiddenInputs}
                          <input type="hidden" name="submissionId" value={s.id} />
                          <FormField label="Status Baru *" full>
                            <select name="newStatus" required defaultValue={s.status} className={inputClass}>
                              {SUBMISSION_STATUS.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </FormField>
                          <FormField label="Keterangan / Laporan *" full>
                            <textarea name="notes" required rows={3} className={inputClass} placeholder="mis. berkas sudah dikirim, menunggu verifikasi pihak luar" />
                          </FormField>
                          <DrawerFooter submitLabel="Simpan Status" />
                        </form>
                      </FormDrawer>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
