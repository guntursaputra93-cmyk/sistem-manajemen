import { pgTable, pgEnum, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { chartOfAccounts } from "./chartOfAccounts";

export const salaryComponentTypeEnum = pgEnum("salary_component_type", ["pendapatan", "potongan"]);

export const salaryComponents = pgTable("salary_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  componentType: salaryComponentTypeEnum("component_type").notNull(),
  // Akun KEWAJIBAN tujuan untuk komponen POTONGAN (mis. Utang BPJS, Utang PPh 21) —
  // Follow-up TODO Fase 3 #1. Kalau diisi, jurnal payroll (finalizePayrollRun)
  // mengkredit akun ini alih-alih menumpuk potongan itu ke 21102 Utang Gaji.
  // NULL (default) = perilaku lama: ikut ke Utang Gaji. Tidak relevan untuk
  // komponen pendapatan. restrict — akun yang dipakai komponen tak boleh dihapus.
  liabilityAccountId: uuid("liability_account_id").references(() => chartOfAccounts.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("salary_components_company_id_code_unique").on(table.companyId, table.code),
]);
