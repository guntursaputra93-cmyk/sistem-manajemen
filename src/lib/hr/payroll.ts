import { and, eq, lte, gte, or, isNull } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { payrollRuns, payslips, employees, employeeSalaryStructures, salaryComponents } from "@/drizzle/schema";

export class PayrollError extends Error {}

/** Hari terakhir bulan `month` (1-12) di tahun `year`, format ISO yyyy-mm-dd. */
function lastDayOfMonthIso(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export type PayslipDetailEntry = { componentId: string; componentName: string; componentType: "pendapatan" | "potongan"; amount: string };

/**
 * Generate payslip untuk semua karyawan aktif dalam 1 payroll run, dari
 * employee_salary_structures yang efektif untuk periode ini. Idempoten 2 lapis:
 * (1) conditional UPDATE payroll_runs.status draft->diproses (guard re-run
 * seluruh run — pola persis approveLeaveRequestAndIncrementBalance/
 * createContractIfMissing), (2) guard per-karyawan (skip kalau payslip untuk
 * run+employee ini sudah ada) — jadi retry setelah crash parsial aman, tidak
 * menduplikasi payslip yang sudah ke-generate.
 *
 * journalEntryId SELALU null di sini — integrasi jurnal adalah scope Fase 3
 * (Keuangan), belum diimplementasikan (lihat komentar di drizzle/schema/payslips.ts).
 */
export async function generatePayslipsForRun(
  tx: typeof Db,
  params: { companyId: string; payrollRunId: string; periodMonth: number; periodYear: number; processedBy: string }
): Promise<{ generated: number; skipped: number }> {
  const [run] = await tx
    .update(payrollRuns)
    .set({ status: "diproses", processedBy: params.processedBy, processedAt: new Date() })
    .where(and(eq(payrollRuns.id, params.payrollRunId), eq(payrollRuns.companyId, params.companyId), eq(payrollRuns.status, "draft")))
    .returning();
  if (!run) throw new PayrollError("Payroll run ini sudah pernah diproses sebelumnya.");

  const periodStart = `${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}-01`;
  const periodEnd = lastDayOfMonthIso(params.periodYear, params.periodMonth);

  const [activeEmployees, components] = await Promise.all([
    tx.select().from(employees).where(and(eq(employees.companyId, params.companyId), eq(employees.employmentStatus, "aktif"))),
    tx.select().from(salaryComponents).where(eq(salaryComponents.companyId, params.companyId)),
  ]);
  const componentById = new Map(components.map((c) => [c.id, c]));

  let generated = 0;
  let skipped = 0;

  for (const emp of activeEmployees) {
    const [existing] = await tx.select().from(payslips).where(and(eq(payslips.payrollRunId, params.payrollRunId), eq(payslips.employeeId, emp.id)));
    if (existing) {
      skipped++;
      continue;
    }

    // Versioning: baris efektif utk periode ini — effective_date <= akhir periode,
    // dan (end_date IS NULL ATAU end_date >= awal periode). Pola sama seperti
    // position_history, tapi TANPA batasan "hanya 1 aktif" (bisa multi-komponen).
    const structures = await tx
      .select()
      .from(employeeSalaryStructures)
      .where(
        and(
          eq(employeeSalaryStructures.employeeId, emp.id),
          lte(employeeSalaryStructures.effectiveDate, periodEnd),
          or(isNull(employeeSalaryStructures.endDate), gte(employeeSalaryStructures.endDate, periodStart))
        )
      );

    if (structures.length === 0) {
      skipped++;
      continue;
    }

    let grossSalaryAmount = 0;
    let salaryDeductions = 0;
    const detail: PayslipDetailEntry[] = [];

    for (const s of structures) {
      const comp = componentById.get(s.salaryComponentId);
      if (!comp) continue;
      const amt = Number(s.salaryAmount);
      if (comp.componentType === "pendapatan") grossSalaryAmount += amt;
      else salaryDeductions += amt;
      detail.push({ componentId: comp.id, componentName: comp.name, componentType: comp.componentType, amount: s.salaryAmount });
    }

    await tx.insert(payslips).values({
      companyId: params.companyId,
      payrollRunId: params.payrollRunId,
      employeeId: emp.id,
      grossSalaryAmount: grossSalaryAmount.toFixed(2),
      salaryDeductions: salaryDeductions.toFixed(2),
      netSalaryAmount: (grossSalaryAmount - salaryDeductions).toFixed(2),
      payslipDetail: detail,
      journalEntryId: null,
    });
    generated++;
  }

  return { generated, skipped };
}

export async function finalizePayrollRun(tx: typeof Db, params: { companyId: string; payrollRunId: string }): Promise<void> {
  const [run] = await tx
    .update(payrollRuns)
    .set({ status: "selesai" })
    .where(and(eq(payrollRuns.id, params.payrollRunId), eq(payrollRuns.companyId, params.companyId), eq(payrollRuns.status, "diproses")))
    .returning();
  if (!run) throw new PayrollError("Payroll run belum diproses atau sudah selesai.");
}
