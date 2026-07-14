import { and, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { chartOfAccounts } from "@/drizzle/schema";
import { CHART_OF_ACCOUNTS_SEED } from "./chartOfAccountsSeed";

/**
 * Seed template akun standar (CHART_OF_ACCOUNTS_SEED, Fase 3 spesifikasi Bagian 1)
 * ke 1 company. Insert bertahap per level (root dulu, baru anaknya) supaya
 * self-reference parent_id selalu resolve ke baris yang sudah ada — bukan 1
 * bulk insert, karena Postgres butuh parent_id valid di INSERT time (FK restrict).
 *
 * Idempoten lewat onConflictDoNothing pada (company_id, code): aman dipanggil ulang
 * (mis. re-seed setelah baris sengaja dihapus admin) tanpa duplikasi atau error.
 */
export async function seedChartOfAccountsForCompany(tx: typeof Db, companyId: string): Promise<{ inserted: number; skipped: number }> {
  const codeToId = new Map<string, string>();
  let inserted = 0;
  let skipped = 0;

  const remaining = [...CHART_OF_ACCOUNTS_SEED];
  // Root (parentCode null) dulu, baru sisanya diurut naik levelnya — level 3 header
  // (mis. BANK) harus masuk sebelum anak level-3-nya (mis. Bank Mandiri), jadi tidak
  // cukup sort by level saja; dilakukan sebagai pass berulang di bawah.
  remaining.sort((a, b) => a.level - b.level);

  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const row = remaining[i];
      const parentId = row.parentCode ? codeToId.get(row.parentCode) : null;
      if (row.parentCode && !parentId) continue; // parent belum ke-insert, coba lagi putaran berikutnya

      const [existing] = await tx
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, row.code)));

      if (existing) {
        codeToId.set(row.code, existing.id);
        skipped++;
      } else {
        const [created] = await tx
          .insert(chartOfAccounts)
          .values({
            companyId,
            code: row.code,
            name: row.name,
            level: row.level,
            parentId: parentId ?? null,
            accountType: row.accountType,
            normalBalance: row.normalBalance,
            isHeader: row.isHeader,
          })
          .returning({ id: chartOfAccounts.id });
        codeToId.set(row.code, created.id);
        inserted++;
      }

      remaining.splice(i, 1);
      progressed = true;
    }
  }

  if (remaining.length > 0) {
    throw new Error(`seedChartOfAccountsForCompany: ${remaining.length} baris tidak bisa di-resolve parent-nya (kemungkinan parentCode salah ketik): ${remaining.map((r) => r.code).join(", ")}`);
  }

  return { inserted, skipped };
}
