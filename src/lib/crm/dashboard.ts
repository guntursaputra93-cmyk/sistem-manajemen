import { and, asc, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { pipelineStages, opportunities, contracts, organizations } from "@/drizzle/schema";

function withVisibilityFilter<T extends { assignedTo: string }>(rows: T[], visibleAssigneeIds: string[] | null): T[] {
  return visibleAssigneeIds ? rows.filter((r) => visibleAssigneeIds.includes(r.assignedTo)) : rows;
}

export type PipelineStageValue = {
  stageId: string;
  stageKey: string;
  stageOrder: number;
  count: number;
  totalValue: number;
};

/** Pipeline value per tahap (spesifikasi CRM Langkah 6) — hanya opportunity berstatus open, ditapis visibilitas viewer. */
export async function getPipelineValueByStage(tx: typeof Db, params: { companyId: string; visibleAssigneeIds: string[] | null }): Promise<PipelineStageValue[]> {
  const stages = await tx.select().from(pipelineStages).where(eq(pipelineStages.companyId, params.companyId)).orderBy(asc(pipelineStages.stageOrder));
  const openOpps = withVisibilityFilter(
    await tx.select().from(opportunities).where(and(eq(opportunities.companyId, params.companyId), eq(opportunities.status, "open"))),
    params.visibleAssigneeIds
  );

  return stages.map((stage) => {
    const inStage = openOpps.filter((o) => o.currentStageId === stage.id);
    return {
      stageId: stage.id,
      stageKey: stage.stageKey,
      stageOrder: stage.stageOrder,
      count: inStage.length,
      totalValue: inStage.reduce((sum, o) => sum + Number(o.estimatedValue ?? 0), 0),
    };
  });
}

export type WinRate = { wonCount: number; lostCount: number; winRate: number | null };

/** Win rate = menang / (menang + hilang), ditapis visibilitas viewer — null kalau belum ada deal closed sama sekali. */
export async function getWinRate(tx: typeof Db, params: { companyId: string; visibleAssigneeIds: string[] | null }): Promise<WinRate> {
  const closedOpps = withVisibilityFilter(
    await tx.select().from(opportunities).where(and(eq(opportunities.companyId, params.companyId), inArray(opportunities.status, ["won", "lost"]))),
    params.visibleAssigneeIds
  );
  const wonCount = closedOpps.filter((o) => o.status === "won").length;
  const lostCount = closedOpps.filter((o) => o.status === "lost").length;
  const total = wonCount + lostCount;
  return { wonCount, lostCount, winRate: total > 0 ? wonCount / total : null };
}

export type RenewalReminder = {
  contractId: string;
  organizationName: string;
  opportunityTitle: string;
  reason: "renewal_reminder_date" | "end_date_no_active_opportunity";
  dueDate: string;
};

/**
 * Reminder siklus ulang (spesifikasi CRM Bagian 2.6) — kontrak dgn renewal_reminder_date
 * mendekati (<=60 hari), ATAU end_date mendekati (<=60 hari) TANPA opportunity open baru
 * utk organisasi yang sama. Ditapis visibilitas viewer via opportunity.assigned_to.
 */
export async function getRenewalReminders(
  tx: typeof Db,
  params: { companyId: string; visibleAssigneeIds: string[] | null; today: Date }
): Promise<RenewalReminder[]> {
  const windowEnd = new Date(params.today);
  windowEnd.setDate(windowEnd.getDate() + 60);
  const todayStr = params.today.toISOString().slice(0, 10);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const [contractRows, oppRows, orgRows] = await Promise.all([
    tx.select().from(contracts).where(eq(contracts.companyId, params.companyId)),
    tx.select().from(opportunities).where(eq(opportunities.companyId, params.companyId)),
    tx.select().from(organizations).where(eq(organizations.companyId, params.companyId)),
  ]);

  const visibleContracts = contractRows.filter((c) => {
    if (!params.visibleAssigneeIds) return true;
    const opp = oppRows.find((o) => o.id === c.opportunityId);
    return opp ? params.visibleAssigneeIds.includes(opp.assignedTo) : false;
  });

  const reminders: RenewalReminder[] = [];
  for (const c of visibleContracts) {
    const opp = oppRows.find((o) => o.id === c.opportunityId);
    const org = orgRows.find((o) => o.id === c.organizationId);
    if (!org) continue;

    if (c.renewalReminderDate && c.renewalReminderDate >= todayStr && c.renewalReminderDate <= windowEndStr) {
      reminders.push({ contractId: c.id, organizationName: org.name, opportunityTitle: opp?.title ?? "-", reason: "renewal_reminder_date", dueDate: c.renewalReminderDate });
      continue;
    }

    if (c.endDate && c.endDate >= todayStr && c.endDate <= windowEndStr) {
      const hasActiveOpportunity = oppRows.some((o) => o.organizationId === c.organizationId && o.status === "open");
      if (!hasActiveOpportunity) {
        reminders.push({ contractId: c.id, organizationName: org.name, opportunityTitle: opp?.title ?? "-", reason: "end_date_no_active_opportunity", dueDate: c.endDate });
      }
    }
  }

  return reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
