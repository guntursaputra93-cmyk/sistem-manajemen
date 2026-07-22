import { pgTable, pgEnum, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { organizations } from "./organizations";
import { users } from "./users";
import { opportunities } from "./opportunities";
import { contracts } from "./contracts";

// Tahap siklus layanan klien (Case Management, langkah 1.1). Lapisan orkestrasi
// intake->delivery — TIDAK menduplikasi data opportunities/contracts/service_assignments,
// hanya menautkannya (opportunity_id/contract_id/case_service_assignments).
export const caseStageEnum = pgEnum("case_stage", [
  "intake",
  "penawaran",
  "kontrak",
  "penugasan",
  "pelaksanaan",
  "review",
  "delivery",
  "closed",
  "cancelled",
]);

export const caseStatusEnum = pgEnum("case_status", ["aktif", "on_hold", "selesai", "batal"]);

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Diisi manual dulu; generator otomatis dikerjakan di langkah 1.4 (bukan sekarang).
  caseNumber: text("case_number").unique(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  serviceType: text("service_type"),
  currentStage: caseStageEnum("current_stage").notNull().default("intake"),
  status: caseStatusEnum("status").notNull().default("aktif"),
  picUserId: uuid("pic_user_id").references(() => users.id, { onDelete: "set null" }),
  // Tautan opsional ke CRM/kontrak — restrict supaya data sumber tidak hilang diam-diam
  // sementara case masih menautkannya.
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "restrict" }),
  contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "restrict" }),
  openedAt: date("opened_at").notNull().default(sql`CURRENT_DATE`),
  targetCloseDate: date("target_close_date"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cases_company_id_idx").on(table.companyId),
  index("cases_organization_id_idx").on(table.organizationId),
  index("cases_opportunity_id_idx").on(table.opportunityId),
  index("cases_contract_id_idx").on(table.contractId),
  index("cases_pic_user_id_idx").on(table.picUserId),
]);
