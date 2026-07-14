import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { rkapBudgets, rkapBudgetMonthly, chartOfAccounts } from "@/drizzle/schema";
import { getPostedLineTotals, computeNaturalBalance } from "./reports";

type Account = typeof chartOfAccounts.$inferSelect;
type Budget = typeof rkapBudgets.$inferSelect;

export type MonthlyRealization = { month: number; budgeted: number; actual: number; variance: number };

export type BudgetRealizationRow = {
  budget: Budget;
  account: Account;
  actualAmount: number;
  /** aktual - anggaran (positif = lebih dari anggaran). */
  varianceAmount: number;
  /** null kalau anggaran 0 (persentase tak terhingga, tidak bermakna). */
  variancePercent: number | null;
  /** null kalau akun ini tidak punya breakdown bulanan. */
  monthly: MonthlyRealization[] | null;
};

/**
 * Realisasi vs anggaran (Fase 3 Langkah 6) — aktual diambil dari getPostedLineTotals
 * & computeNaturalBalance yang SUDAH ADA di reports.ts (Langkah 3), bukan ditulis
 * ulang dari nol (instruksi Gtr). Breakdown bulanan (kalau ada) juga reuse fungsi
 * yang sama, dipanggil 12x dengan rentang tanggal per bulan — bukan query agregasi
 * baru yang meniru ulang logic buku besar.
 */
export async function getBudgetRealization(tx: typeof Db, params: { companyId: string; year: number }): Promise<BudgetRealizationRow[]> {
  const budgetRows = await tx
    .select({ budget: rkapBudgets, account: chartOfAccounts })
    .from(rkapBudgets)
    .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, rkapBudgets.accountId))
    .where(and(eq(rkapBudgets.companyId, params.companyId), eq(rkapBudgets.year, params.year)))
    .orderBy(asc(chartOfAccounts.code));

  if (budgetRows.length === 0) return [];

  const yearStart = `${params.year}-01-01`;
  const yearEnd = `${params.year}-12-31`;
  const annualTotals = await getPostedLineTotals(tx, { companyId: params.companyId, startDate: yearStart, endDate: yearEnd });

  const monthlyBudgetRows = await tx.select().from(rkapBudgetMonthly).where(eq(rkapBudgetMonthly.companyId, params.companyId));
  const hasAnyMonthly = monthlyBudgetRows.length > 0;

  const monthlyActualsByMonth = new Map<number, Map<string, { debit: number; credit: number }>>();
  if (hasAnyMonthly) {
    for (let month = 1; month <= 12; month++) {
      const monthStart = `${params.year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(params.year, month, 0).getDate();
      const monthEnd = `${params.year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      monthlyActualsByMonth.set(month, await getPostedLineTotals(tx, { companyId: params.companyId, startDate: monthStart, endDate: monthEnd }));
    }
  }

  const monthlyBudgetsByBudgetId = new Map<string, (typeof monthlyBudgetRows)[number][]>();
  for (const m of monthlyBudgetRows) {
    if (!monthlyBudgetsByBudgetId.has(m.budgetId)) monthlyBudgetsByBudgetId.set(m.budgetId, []);
    monthlyBudgetsByBudgetId.get(m.budgetId)!.push(m);
  }

  return budgetRows.map(({ budget, account }) => {
    const actualAmount = computeNaturalBalance(account, annualTotals.get(account.id));
    const budgetedAmount = Number(budget.budgetedAmount);
    const varianceAmount = actualAmount - budgetedAmount;
    const variancePercent = budgetedAmount !== 0 ? (varianceAmount / budgetedAmount) * 100 : null;

    const monthlyBudgetsForThis = monthlyBudgetsByBudgetId.get(budget.id);
    const monthly: MonthlyRealization[] | null = monthlyBudgetsForThis
      ? [...monthlyBudgetsForThis]
          .sort((a, b) => a.month - b.month)
          .map((m) => {
            const monthActual = computeNaturalBalance(account, monthlyActualsByMonth.get(m.month)?.get(account.id));
            const monthBudgeted = Number(m.budgetedAmount);
            return { month: m.month, budgeted: monthBudgeted, actual: monthActual, variance: monthActual - monthBudgeted };
          })
      : null;

    return { budget, account, actualAmount, varianceAmount, variancePercent, monthly };
  });
}
