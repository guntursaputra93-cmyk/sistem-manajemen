import { pgTable, pgEnum, uuid, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { opportunities } from "./opportunities";
import { organizations } from "./organizations";

export const contractPaymentStatusEnum = pgEnum("contract_payment_status", ["belum_dibayar", "sebagian", "lunas"]);

// Dibuat otomatis saat opportunities.status -> 'won' (spesifikasi CRM Bagian 2.4,
// keputusan eksekusi: otomatis, bukan prompt konfirmasi) — lihat lib/crm/contracts.ts.
export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Restrict — opportunity yg sudah punya contract tidak boleh terhapus begitu saja.
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "restrict" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  // Nilai final (bisa beda dari estimated_value hasil negosiasi) — bisa diedit manual setelah dibuat otomatis.
  contractValue: numeric("contract_value", { precision: 15, scale: 2 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  paymentStatus: contractPaymentStatusEnum("payment_status").notNull().default("belum_dibayar"),
  // Dipakai utk reminder siklus ulang (spesifikasi CRM Bagian 2.6) — diisi manual, nullable.
  renewalReminderDate: date("renewal_reminder_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
