import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import {
  companies,
  incomingLetters,
  outgoingLetters,
  opportunities,
  organizations,
  pipelineStages,
  approvalSteps,
  users,
  companyModules,
  arInvoices,
  employees,
  competencyTypes,
} from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { getVisibleAssigneeIds } from "@/lib/crm/opportunities";
import { getExpiringCompetencies } from "@/lib/hr/competencies";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrailStepper } from "@/components/ui/TrailStepper";
import { StatCard } from "@/components/ui/StatCard";
import { approvalStepsToTrail } from "@/lib/ui/approvalTrail";
import { Inbox, Send, FileText, Target, AlertTriangle } from "lucide-react";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const INCOMING_STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  didisposisikan: "Didisposisikan",
  selesai: "Selesai",
  diarsipkan: "Diarsipkan",
};

const INCOMING_STATUS_VARIANT: Record<string, BadgeVariant> = {
  baru: "powder-blue",
  didisposisikan: "sage",
  selesai: "sage",
  diarsipkan: "dusty-rose",
};

const OUTGOING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

const OUTGOING_STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "powder-blue",
  menunggu_approval: "dusty-rose",
  disetujui: "sage",
  terkirim: "sage",
  ditolak: "destructive",
};

function greeting(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function formatRupiah(value: string | null): string {
  if (!value) return "-";
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

function formatShortDate(isoDate: string): string {
  return format(parseISO(isoDate), "d MMM yyyy", { locale: idLocale });
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const viewerRole = session.user.role as Role;

  // Semua data kartu digabung dalam 1 transaksi (1 round-trip BEGIN/SET LOCAL/COMMIT,
  // bukan 1 transaksi terpisah per kartu — pelajaran dari perbaikan layout.tsx).
  const {
    monthlyCounts,
    activeDocumentCount,
    opportunityOpenCount,
    currentLetter,
    currentLetterSteps,
    currentLetterApprovers,
    recentIncoming,
    openOpportunities,
    pipelineStageList,
    financeTrend,
    dueInvoices,
    expiringCerts,
  } = await withTenantContext(tenantContext, async (tx) => {
    // department_head butuh tahu departemen sendiri dulu untuk visibility CRM;
    // staff/company_admin/super_admin tidak perlu query tambahan sama sekali.
    let viewerDepartmentId: string | null = null;
    if (viewerRole === "department_head") {
      const [self] = await tx.select({ departmentId: users.departmentId }).from(users).where(eq(users.id, session.user.id));
      viewerDepartmentId = self?.departmentId ?? null;
    }
    const visibleAssigneeIds = await getVisibleAssigneeIds(tx, {
      companyId: company.id,
      viewer: { userId: session.user.id, role: viewerRole, departmentId: viewerDepartmentId },
    });

    const [countsResult, oppCountResult, [letter], incomingRows, oppRows, stageList] = await Promise.all([
      // 3 counter surat masuk/keluar bulan ini + dokumen aktif digabung 1 query (raw SQL scalar subquery).
      tx.execute(sql`
        select
          (select count(*)::int from incoming_letters where company_id = ${company.id} and date_trunc('month', received_date) = date_trunc('month', current_date)) as "suratMasukCount",
          (select count(*)::int from outgoing_letters where company_id = ${company.id} and date_trunc('month', created_at) = date_trunc('month', current_date)) as "suratKeluarCount",
          (select count(*)::int from document_versions where company_id = ${company.id} and status = 'active') as "dokumenAktifCount"
      `),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.companyId, company.id),
            eq(opportunities.status, "open"),
            visibleAssigneeIds ? inArray(opportunities.assignedTo, visibleAssigneeIds) : undefined
          )
        ),
      tx
        .select()
        .from(outgoingLetters)
        .where(
          and(
            eq(outgoingLetters.companyId, company.id),
            inArray(outgoingLetters.status, ["menunggu_approval", "disetujui"])
          )
        )
        .orderBy(desc(outgoingLetters.updatedAt))
        .limit(1),
      tx
        .select()
        .from(incomingLetters)
        .where(eq(incomingLetters.companyId, company.id))
        .orderBy(desc(incomingLetters.createdAt))
        .limit(5),
      tx
        .select({
          id: opportunities.id,
          title: opportunities.title,
          estimatedValue: opportunities.estimatedValue,
          organizationName: organizations.name,
          stageKey: pipelineStages.stageKey,
          currentStageId: opportunities.currentStageId,
        })
        .from(opportunities)
        .innerJoin(organizations, eq(organizations.id, opportunities.organizationId))
        .leftJoin(pipelineStages, eq(pipelineStages.id, opportunities.currentStageId))
        .where(
          and(
            eq(opportunities.companyId, company.id),
            eq(opportunities.status, "open"),
            visibleAssigneeIds ? inArray(opportunities.assignedTo, visibleAssigneeIds) : undefined
          )
        )
        .orderBy(desc(opportunities.estimatedValue), desc(opportunities.createdAt))
        .limit(5),
      // Dipakai hitung progres bar per opportunity (posisi tahap saat ini / total tahap) —
      // tabelnya kecil (biasanya <10 baris per company), aman digabung di sini.
      tx
        .select({ id: pipelineStages.id, stageOrder: pipelineStages.stageOrder })
        .from(pipelineStages)
        .where(eq(pipelineStages.companyId, company.id))
        .orderBy(asc(pipelineStages.stageOrder)),
    ]);

    const counts = countsResult[0] as unknown as { suratMasukCount: number; suratKeluarCount: number; dokumenAktifCount: number };

    let steps: (typeof approvalSteps.$inferSelect)[] = [];
    let approvers: { id: string; fullName: string }[] = [];
    if (letter) {
      steps = await tx
        .select()
        .from(approvalSteps)
        .where(and(eq(approvalSteps.entityType, letter.letterCategory), eq(approvalSteps.entityId, letter.id)))
        .orderBy(approvalSteps.stepOrder);
      const approverIds = [...new Set(steps.map((s) => s.approverId).filter((id): id is string => id !== null))];
      approvers = approverIds.length
        ? await tx.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, approverIds))
        : [];
    }

    // ===== Modul aktif → gate grafik keuangan & pengingat =====
    const moduleRows = await tx.select().from(companyModules).where(eq(companyModules.companyId, company.id));
    const enabledModules = new Set(moduleRows.filter((m) => m.isEnabled).map((m) => m.moduleKey));

    // Grafik tren: pendapatan vs biaya(+HPP) per bulan tahun berjalan, jurnal posted.
    const currentYear = new Date().getFullYear();
    let financeTrend: { month: number; pendapatan: number; biaya: number }[] = [];
    if (enabledModules.has("keuangan") && hasPermission(viewerRole, "VIEW_FINANCIAL_REPORTS")) {
      const trendResult = await tx.execute(sql`
        select extract(month from je.entry_date)::int as "month",
          coalesce(sum(case when coa.account_type = 'pendapatan' then jel.credit_amount - jel.debit_amount else 0 end), 0)::float as "pendapatan",
          coalesce(sum(case when coa.account_type in ('hpp', 'biaya') then jel.debit_amount - jel.credit_amount else 0 end), 0)::float as "biaya"
        from journal_entry_lines jel
        join journal_entries je on je.id = jel.journal_entry_id
        join chart_of_accounts coa on coa.id = jel.account_id
        where jel.company_id = ${company.id} and je.status = 'posted'
          and extract(year from je.entry_date) = ${currentYear}
        group by 1 order by 1
      `);
      financeTrend = trendResult as unknown as { month: number; pendapatan: number; biaya: number }[];
    }

    // Pengingat: invoice belum lunas yang jatuh tempo ≤7 hari / sudah lewat.
    let dueInvoices: { id: string; invoiceNumber: string | null; dueDate: string; amount: string; status: string }[] = [];
    if (enabledModules.has("keuangan") && hasPermission(viewerRole, "VIEW_AR_INVOICES")) {
      const soon = new Date();
      soon.setDate(soon.getDate() + 7);
      dueInvoices = await tx
        .select({ id: arInvoices.id, invoiceNumber: arInvoices.invoiceNumber, dueDate: arInvoices.dueDate, amount: arInvoices.amount, status: arInvoices.status })
        .from(arInvoices)
        .where(and(eq(arInvoices.companyId, company.id), inArray(arInvoices.status, ["belum_dibayar", "sebagian", "jatuh_tempo"])))
        .orderBy(asc(arInvoices.dueDate))
        .then((rows) => rows.filter((r) => r.dueDate <= soon.toISOString().slice(0, 10)).slice(0, 5));
    }

    // Pengingat: sertifikat kompetensi kedaluwarsa ≤3 bulan.
    let expiringCerts: { id: string; employeeName: string; typeName: string; expiresAt: string | null }[] = [];
    if (enabledModules.has("sdm_kompetensi") && hasPermission(viewerRole, "VIEW_EMPLOYEE_COMPETENCIES")) {
      const expRows = await getExpiringCompetencies(tx, { companyId: company.id, withinMonths: 3 });
      const top = expRows.slice(0, 5);
      const empIds = [...new Set(top.map((r) => r.employeeId))];
      const typeIds = [...new Set(top.map((r) => r.competencyTypeId))];
      const [empRows, typeRows] = await Promise.all([
        empIds.length ? tx.select({ id: employees.id, fullName: employees.fullName }).from(employees).where(inArray(employees.id, empIds)) : [],
        typeIds.length ? tx.select({ id: competencyTypes.id, name: competencyTypes.name }).from(competencyTypes).where(inArray(competencyTypes.id, typeIds)) : [],
      ]);
      const empName = new Map(empRows.map((e) => [e.id, e.fullName]));
      const typeName = new Map(typeRows.map((t) => [t.id, t.name]));
      expiringCerts = top.map((r) => ({
        id: r.id,
        employeeName: empName.get(r.employeeId) ?? "-",
        typeName: typeName.get(r.competencyTypeId) ?? "-",
        expiresAt: r.expiresAt,
      }));
    }

    return {
      monthlyCounts: { suratMasuk: counts.suratMasukCount, suratKeluar: counts.suratKeluarCount },
      activeDocumentCount: counts.dokumenAktifCount,
      opportunityOpenCount: oppCountResult[0]?.count ?? 0,
      currentLetter: letter,
      currentLetterSteps: steps,
      currentLetterApprovers: approvers,
      recentIncoming: incomingRows,
      openOpportunities: oppRows,
      pipelineStageList: stageList,
      financeTrend,
      dueInvoices,
      expiringCerts,
    };
  });

  const now = new Date();
  const tanggalHariIni = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const summaryCards = [
    { label: "Surat Masuk Bulan Ini", value: monthlyCounts.suratMasuk, icon: Inbox, href: `/${companySlug}/surat-masuk` },
    { label: "Surat Keluar Bulan Ini", value: monthlyCounts.suratKeluar, icon: Send, href: `/${companySlug}/surat-keluar` },
    { label: "Dokumen Aktif", value: activeDocumentCount, icon: FileText, href: `/${companySlug}/dokumen` },
    { label: "Opportunity Terbuka", value: opportunityOpenCount, icon: Target, href: `/${companySlug}/crm/opportunities` },
  ];

  // Grafik tren: lengkapi 12 bulan (bulan tanpa transaksi = 0), skala relatif thd nilai terbesar.
  const trendByMonth = new Map(financeTrend.map((t) => [t.month, t]));
  const trendMonths = Array.from({ length: 12 }, (_, i) => {
    const t = trendByMonth.get(i + 1);
    return { month: i + 1, pendapatan: t?.pendapatan ?? 0, biaya: t?.biaya ?? 0 };
  });
  const trendMax = Math.max(1, ...trendMonths.flatMap((t) => [t.pendapatan, t.biaya]));
  const showTrend = financeTrend.length > 0;
  const attentionCount = dueInvoices.length + expiringCerts.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-extrabold text-ink">
          {greeting(now.getHours())}, {session.user.name ?? "Pengguna"}
        </h1>
        <p className="text-[13px] text-ink-muted mt-1">
          Berikut ringkasan aktivitas {company.name} hari ini, {tanggalHariIni}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            <StatCard label={label} value={value} icon={<Icon size={15} aria-hidden="true" />} />
          </Link>
        ))}
      </div>

      {(showTrend || attentionCount > 0) && (
        <div className={`grid grid-cols-1 gap-6 ${showTrend && attentionCount > 0 ? "lg:grid-cols-[3fr_2fr]" : ""}`}>
          {showTrend && (
            <Card
              title={`Tren Keuangan ${now.getFullYear()}`}
              description="Pendapatan vs Biaya+HPP per bulan — dari jurnal berstatus posted."
            >
              <div className="flex items-end gap-1.5 pt-2" style={{ height: "150px" }}>
                {trendMonths.map((t) => (
                  <div key={t.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="flex h-full w-full items-end justify-center gap-[3px]">
                      <div
                        className="w-[9px] rounded-t bg-success/80 transition-[height] duration-500"
                        style={{ height: `${Math.round((t.pendapatan / trendMax) * 100)}%` }}
                        title={`Pendapatan ${MONTH_SHORT[t.month - 1]}: ${formatRupiah(String(t.pendapatan))}`}
                      />
                      <div
                        className="w-[9px] rounded-t bg-coral transition-[height] duration-500"
                        style={{ height: `${Math.round((t.biaya / trendMax) * 100)}%` }}
                        title={`Biaya+HPP ${MONTH_SHORT[t.month - 1]}: ${formatRupiah(String(t.biaya))}`}
                      />
                    </div>
                    <span className="text-[10px] text-ink-muted">{MONTH_SHORT[t.month - 1]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-success/80" /> Pendapatan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-coral" /> Biaya + HPP
                </span>
              </div>
            </Card>
          )}

          {attentionCount > 0 && (
            <Card
              title="Perlu Perhatian"
              description="Pengingat otomatis — invoice hampir/lewat jatuh tempo & sertifikat hampir kedaluwarsa."
              action={
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle size={14} className="text-destructive" aria-hidden="true" />
                </span>
              }
            >
              <ul className="space-y-2 text-[13px]">
                {dueInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 border-b border-ink-muted/10 pb-2">
                    <Link href={`/${companySlug}/keuangan/piutang/${inv.id}`} className="min-w-0 truncate text-ink hover:underline">
                      Invoice {inv.invoiceNumber ?? "(draft)"} — {formatRupiah(inv.amount)}
                    </Link>
                    <span className="shrink-0 text-xs font-semibold text-destructive">
                      tempo {new Date(inv.dueDate).toLocaleDateString("id-ID")}
                    </span>
                  </li>
                ))}
                {expiringCerts.map((cert) => (
                  <li key={cert.id} className="flex items-center justify-between gap-3 border-b border-ink-muted/10 pb-2">
                    <Link href={`/${companySlug}/sdm/kompetensi`} className="min-w-0 truncate text-ink hover:underline">
                      {cert.employeeName} — {cert.typeName}
                    </Link>
                    <span className="shrink-0 text-xs font-semibold text-destructive">exp {cert.expiresAt ?? "-"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Card
        title="Proses Terkini"
        description="Surat keluar/nota dinas yang sedang berjalan approval-nya."
        action={
          currentLetter && (
            <Badge variant={OUTGOING_STATUS_VARIANT[currentLetter.status] ?? "powder-blue"}>
              {OUTGOING_STATUS_LABEL[currentLetter.status] ?? currentLetter.status}
            </Badge>
          )
        }
      >
        {!currentLetter ? (
          <EmptyState message="Tidak ada surat keluar atau nota dinas yang sedang dalam proses approval saat ini." />
        ) : (
          <div className="space-y-4">
            <div>
              <Link href={`/${companySlug}/surat-keluar/${currentLetter.id}`} className="font-medium text-ink hover:underline">
                {currentLetter.letterNumber ?? "(Draft — belum ada nomor)"} — {currentLetter.subject}
              </Link>
            </div>
            {currentLetterSteps.length > 0 && (
              <TrailStepper steps={approvalStepsToTrail(currentLetterSteps, currentLetterApprovers)} orientation="horizontal" />
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Surat Masuk Terbaru">
          {recentIncoming.length === 0 ? (
            <EmptyState message="Belum ada surat masuk. Surat yang diregistrasi akan muncul di sini." />
          ) : (
            <ul className="space-y-3">
              {recentIncoming.map((letter) => (
                <li key={letter.id}>
                  <Link href={`/${companySlug}/surat-masuk/${letter.id}`} className="flex items-start justify-between gap-3 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate group-hover:underline">{letter.subject}</p>
                      <p className="text-xs text-ink-muted">
                        {letter.agendaNumber} · {formatShortDate(letter.receivedDate)}
                      </p>
                    </div>
                    <Badge variant={INCOMING_STATUS_VARIANT[letter.status] ?? "powder-blue"}>
                      {INCOMING_STATUS_LABEL[letter.status] ?? letter.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="CRM — Opportunity">
          {openOpportunities.length === 0 ? (
            <EmptyState message="Belum ada opportunity yang sedang berjalan. Opportunity baru akan muncul di sini." />
          ) : (
            <ul className="space-y-4">
              {openOpportunities.map((opp) => {
                const stageIndex = pipelineStageList.findIndex((s) => s.id === opp.currentStageId);
                const progressPct = stageIndex >= 0 && pipelineStageList.length > 0 ? Math.round(((stageIndex + 1) / pipelineStageList.length) * 100) : 0;
                return (
                  <li key={opp.id}>
                    <Link href={`/${companySlug}/crm/opportunities/${opp.id}`} className="block group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink truncate group-hover:underline">{opp.title}</p>
                          <p className="text-xs text-ink-muted">{opp.organizationName}{opp.stageKey ? ` — ${opp.stageKey}` : ""}</p>
                        </div>
                        <span className="text-sm font-medium text-ink shrink-0">{formatRupiah(opp.estimatedValue)}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-sage/20 overflow-hidden">
                        <div className="h-full rounded-full bg-sage-deep transition-[width]" style={{ width: `${progressPct}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
