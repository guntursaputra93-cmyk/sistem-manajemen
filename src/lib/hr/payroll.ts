import { and, eq, lte, gte, or, isNull } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { payrollRuns, payslips, employees, employeeSalaryStructures, salaryComponents, kasbonRequests, chartOfAccounts, journalEntries, journalEntryLines } from "@/drizzle/schema";
import { postJournalEntry } from "@/lib/finance/journal";

export class PayrollError extends Error {}

/** Hari terakhir bulan `month` (1-12) di tahun `year`, format ISO yyyy-mm-dd. */
function lastDayOfMonthIso(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Akun jurnal payroll di-hardcode SENGAJA (bukan dipilih admin) — sama alasannya
// dengan 11303 Piutang Karyawan di lib/hr/kasbon.ts: ini akun standar yang selalu
// sama untuk transaksi jenis ini, bukan pilihan bebas per transaksi seperti
// revenue_account_id (AR)/offset_account_id (HPP).
const BEBAN_GAJI_CODE = "61101"; // By Gaji
const UTANG_GAJI_CODE = "21102"; // Utang Gaji
const PIUTANG_KARYAWAN_CODE = "11303"; // Piutang Karyawan — sama dgn lib/hr/kasbon.ts

async function getAccountByCode(tx: typeof Db, companyId: string, code: string) {
  const [account] = await tx.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
  if (!account) throw new PayrollError(`Akun ${code} tidak ditemukan untuk company ini — hubungi super admin.`);
  return account;
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
 *
 * Fase 3 Langkah 8 (kasbon): baris potongan "Cicilan Kasbon" ditambahkan di sini
 * (dihitung, MIN(installment_amount, remaining_balance) per kasbon disetujui &
 * remaining_balance>0 milik karyawan ini) — tapi remaining_balance kasbon itu sendiri
 * BELUM dikurangi di sini. Pengurangan baru terjadi di finalizePayrollRun, saat
 * payroll run (dan payslip-nya) benar-benar final — momen yang sama dengan kapan
 * payroll existing dianggap final, guard idempotency-nya SAMA dengan guard run yang
 * sudah ada (draft->diproses di atas), TIDAK ada mekanisme idempotency baru.
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

  const [activeEmployees, components, approvedKasbons] = await Promise.all([
    tx.select().from(employees).where(and(eq(employees.companyId, params.companyId), eq(employees.employmentStatus, "aktif"))),
    tx.select().from(salaryComponents).where(eq(salaryComponents.companyId, params.companyId)),
    tx.select().from(kasbonRequests).where(and(eq(kasbonRequests.companyId, params.companyId), eq(kasbonRequests.status, "disetujui"))),
  ]);
  const kasbonsByEmployeeId = new Map<string, (typeof approvedKasbons)[number][]>();
  for (const k of approvedKasbons) {
    if (Number(k.remainingBalance) <= 0) continue;
    if (!kasbonsByEmployeeId.has(k.employeeId)) kasbonsByEmployeeId.set(k.employeeId, []);
    kasbonsByEmployeeId.get(k.employeeId)!.push(k);
  }
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

    // componentId di sini SENGAJA id baris kasbon_requests (bukan salary_components,
    // tidak ada baris salary_components utk kasbon) — payslipDetail adalah JSONB
    // bebas FK, dan componentName "Cicilan Kasbon" dipakai finalizePayrollRun sebagai
    // penanda baris mana yang perlu mengurangi remaining_balance kasbon terkait.
    for (const kasbon of kasbonsByEmployeeId.get(emp.id) ?? []) {
      const cicilan = Math.min(Number(kasbon.installmentAmount), Number(kasbon.remainingBalance));
      if (cicilan <= 0) continue;
      salaryDeductions += cicilan;
      detail.push({ componentId: kasbon.id, componentName: "Cicilan Kasbon", componentType: "potongan", amount: cicilan.toFixed(2) });
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

/**
 * Fase 3 Langkah 8 (kasbon): momen run+payslip dianggap final ADALAH di sini (status
 * diproses->selesai), bukan saat generatePayslipsForRun — jadi remaining_balance
 * kasbon baru dikurangi setelah guard di bawah berhasil lolos. Guard ini SAMA PERSIS
 * dengan yang sudah ada sebelum Langkah 8 (conditional UPDATE, hanya sukses sekali per
 * run) — TIDAK diubah di Langkah 8b, tidak ada mekanisme idempotency baru; run yang
 * sudah 'selesai' tidak akan pernah lolos guard ini lagi, jadi baik pengurangan
 * remaining_balance MAUPUN pembuatan jurnal di bawah tidak mungkin terjadi dua kali
 * untuk run yang sama — keduanya dalam transaksi atomik yang sama (withTenantContext),
 * jadi tidak ada skenario salah satu berhasil sementara yang lain gagal.
 *
 * Fase 3 Langkah 8b (integrasi jurnal payroll): 1 jurnal GABUNGAN per run (bukan 1
 * per payslip) — konsisten dengan pola penyusutan Langkah 7 ("1 jurnal gabungan
 * multi-baris"), dan lebih sesuai praktik akuntansi payroll riil (1 payroll journal
 * per periode gaji, bukan 1 per karyawan yang akan membanjiri Buku Besar). Struktur:
 *   - Debit 61101 By Gaji = total gross seluruh payslip di run ini.
 *   - Kredit 11303 Piutang Karyawan = total potongan "Cicilan Kasbon" (offset kasbon,
 *     supaya penurunan remaining_balance di atas tercermin juga di Buku Besar).
 *   - Kredit 21102 Utang Gaji = SISANYA (gross dikurangi offset kasbon per payslip).
 * CATATAN SCOPE (dilaporkan, bukan diam-diam di-skip): potongan LAIN selain kasbon
 * (mis. BPJS, PPH 21 — kalau admin buat salary_components dengan nama itu) TIDAK
 * dipetakan ke akun kewajiban masing-masing (21201 Utang PPH 21 dst.) — tidak ada
 * kolom akun di salary_components sama sekali saat ini, jadi tidak ada cara
 * andal membedakan komponen mana yang "PPH 21" vs "BPJS" tanpa menambah skema baru
 * (relasi salary_components -> chart_of_accounts) di luar scope Langkah 8b ini.
 * Akibatnya, potongan non-kasbon (kalau ada) tetap ikut ke Kredit 21102 Utang Gaji
 * (bukan hilang dari jurnal — jurnal tetap balance — hanya belum dipisah per jenis
 * potongan). Follow-up: tambahkan kolom akun ke salary_components kalau granularitas
 * ini diperlukan nanti.
 */
export async function finalizePayrollRun(
  tx: typeof Db,
  params: { companyId: string; payrollRunId: string; finalizedBy: string }
): Promise<{ journalEntryId: string | null; entryNumber: string | null }> {
  const [run] = await tx
    .update(payrollRuns)
    .set({ status: "selesai" })
    .where(and(eq(payrollRuns.id, params.payrollRunId), eq(payrollRuns.companyId, params.companyId), eq(payrollRuns.status, "diproses")))
    .returning();
  if (!run) throw new PayrollError("Payroll run belum diproses atau sudah selesai.");

  const runPayslips = await tx.select().from(payslips).where(eq(payslips.payrollRunId, params.payrollRunId));

  let totalGross = 0;
  let totalKasbonOffset = 0;

  for (const p of runPayslips) {
    totalGross += Number(p.grossSalaryAmount);
    const detail = (p.payslipDetail as PayslipDetailEntry[]) ?? [];
    for (const entry of detail) {
      if (entry.componentName !== "Cicilan Kasbon") continue;
      totalKasbonOffset += Number(entry.amount);

      const [kasbon] = await tx.select().from(kasbonRequests).where(and(eq(kasbonRequests.id, entry.componentId), eq(kasbonRequests.companyId, params.companyId)));
      if (!kasbon) continue; // defensif — seharusnya selalu ada, entry dibuat dari baris kasbon yang sama

      const newRemaining = Math.max(0, Number(kasbon.remainingBalance) - Number(entry.amount));
      await tx
        .update(kasbonRequests)
        .set({ remainingBalance: newRemaining.toFixed(2), status: newRemaining <= 0.005 ? "lunas" : kasbon.status, updatedAt: new Date() })
        .where(eq(kasbonRequests.id, kasbon.id));
    }
  }

  if (runPayslips.length === 0 || totalGross <= 0) {
    return { journalEntryId: null, entryNumber: null };
  }

  const totalUtangGaji = totalGross - totalKasbonOffset;

  const bebanGajiAccount = await getAccountByCode(tx, params.companyId, BEBAN_GAJI_CODE);

  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId: params.companyId,
      entryDate: lastDayOfMonthIso(run.periodYear, run.periodMonth),
      description: `Payroll periode ${run.periodMonth}/${run.periodYear}`,
      createdBy: params.finalizedBy,
      sourceType: "payroll",
      sourceId: run.id,
    })
    .returning();

  let lineOrder = 1;
  const lines = [{ companyId: params.companyId, journalEntryId: entry.id, accountId: bebanGajiAccount.id, lineOrder: lineOrder++, debitAmount: totalGross.toFixed(2), creditAmount: "0" }];

  if (totalUtangGaji > 0) {
    const utangGajiAccount = await getAccountByCode(tx, params.companyId, UTANG_GAJI_CODE);
    lines.push({ companyId: params.companyId, journalEntryId: entry.id, accountId: utangGajiAccount.id, lineOrder: lineOrder++, debitAmount: "0", creditAmount: totalUtangGaji.toFixed(2) });
  }
  if (totalKasbonOffset > 0) {
    const piutangKaryawanAccount = await getAccountByCode(tx, params.companyId, PIUTANG_KARYAWAN_CODE);
    lines.push({ companyId: params.companyId, journalEntryId: entry.id, accountId: piutangKaryawanAccount.id, lineOrder: lineOrder++, debitAmount: "0", creditAmount: totalKasbonOffset.toFixed(2) });
  }
  await tx.insert(journalEntryLines).values(lines);

  const { entryNumber } = await postJournalEntry(tx, { companyId: params.companyId, journalEntryId: entry.id, postedBy: params.finalizedBy });

  await tx.update(payslips).set({ journalEntryId: entry.id }).where(eq(payslips.payrollRunId, params.payrollRunId));

  return { journalEntryId: entry.id, entryNumber };
}
