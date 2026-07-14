import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { rkapBudgets, rkapBudgetMonthly, chartOfAccounts } from "@/drizzle/schema";

export class RkapError extends Error {}

const BALANCE_EPSILON = 0.005; // toleransi pembulatan 2 desimal (numeric(15,2)), sama seperti journal.ts

async function validateBudgetAccount(tx: typeof Db, companyId: string, accountId: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
  if (!account) throw new RkapError("Akun tidak ditemukan.");
  if (account.isHeader) {
    throw new RkapError("Akun yang dipilih adalah akun header (grup) — hanya akun posting yang boleh dianggarkan.");
  }
  if (account.accountType !== "pendapatan" && account.accountType !== "hpp" && account.accountType !== "biaya") {
    throw new RkapError("RKAP hanya berlaku untuk akun pendapatan, HPP, atau biaya — bukan aset/kewajiban/modal.");
  }
  return account;
}

/**
 * Buat atau ubah anggaran tahunan 1 akun. Kalau anggaran tahunan berubah, breakdown
 * bulanan lama (kalau ada) dihapus — sum-nya sudah tidak cocok dengan total baru,
 * lebih aman dihapus daripada dibiarkan basi/salah jumlah (admin isi ulang lewat
 * setMonthlyBreakdown kalau breakdown masih diperlukan).
 */
export async function upsertBudget(
  tx: typeof Db,
  params: { companyId: string; accountId: string; year: number; budgetedAmount: string; description: string | null; userId: string }
): Promise<{ budgetId: string }> {
  await validateBudgetAccount(tx, params.companyId, params.accountId);

  const [existing] = await tx
    .select()
    .from(rkapBudgets)
    .where(and(eq(rkapBudgets.companyId, params.companyId), eq(rkapBudgets.accountId, params.accountId), eq(rkapBudgets.year, params.year)));

  if (existing) {
    await tx
      .update(rkapBudgets)
      .set({ budgetedAmount: params.budgetedAmount, description: params.description, updatedBy: params.userId, updatedAt: new Date() })
      .where(eq(rkapBudgets.id, existing.id));
    await tx.delete(rkapBudgetMonthly).where(eq(rkapBudgetMonthly.budgetId, existing.id));
    return { budgetId: existing.id };
  }

  const [created] = await tx
    .insert(rkapBudgets)
    .values({
      companyId: params.companyId,
      accountId: params.accountId,
      year: params.year,
      budgetedAmount: params.budgetedAmount,
      description: params.description,
      createdBy: params.userId,
    })
    .returning();
  return { budgetId: created.id };
}

/**
 * Simpan breakdown 12 bulan (Januari..Desember) sekaligus, replace-all (bukan
 * partial update) — sum-nya WAJIB sama dengan rkap_budgets.budgeted_amount induknya,
 * ditolak kalau tidak (lihat komentar schema rkapBudgetMonthly.ts).
 */
export async function setMonthlyBreakdown(
  tx: typeof Db,
  params: { companyId: string; budgetId: string; monthlyAmounts: string[]; userId: string }
): Promise<void> {
  if (params.monthlyAmounts.length !== 12) {
    throw new RkapError("Breakdown bulanan harus berisi 12 nilai (Januari-Desember).");
  }

  const [budget] = await tx.select().from(rkapBudgets).where(and(eq(rkapBudgets.id, params.budgetId), eq(rkapBudgets.companyId, params.companyId)));
  if (!budget) throw new RkapError("Anggaran tidak ditemukan.");

  const sum = params.monthlyAmounts.reduce((s, v) => s + Number(v), 0);
  const annual = Number(budget.budgetedAmount);
  if (Math.abs(sum - annual) > BALANCE_EPSILON) {
    throw new RkapError(`Total breakdown bulanan (${sum.toFixed(2)}) harus sama dengan anggaran tahunan (${annual.toFixed(2)}).`);
  }

  await tx.delete(rkapBudgetMonthly).where(eq(rkapBudgetMonthly.budgetId, budget.id));
  await tx.insert(rkapBudgetMonthly).values(
    params.monthlyAmounts.map((amount, idx) => ({
      companyId: params.companyId,
      budgetId: budget.id,
      month: idx + 1,
      budgetedAmount: amount,
    }))
  );

  await tx.update(rkapBudgets).set({ updatedBy: params.userId, updatedAt: new Date() }).where(eq(rkapBudgets.id, budget.id));
}
