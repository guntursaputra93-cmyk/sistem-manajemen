import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { cases } from "./cases";
import { caseStageEnum } from "./cases";
import { users } from "./users";

// Jejak perpindahan tahap sebuah case (audit trail current_stage). from_stage NULL
// pada entri intake awal.
export const caseStageHistory = pgTable("case_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  fromStage: caseStageEnum("from_stage"),
  toStage: caseStageEnum("to_stage").notNull(),
  notes: text("notes"),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_stage_history_company_id_idx").on(table.companyId),
  index("case_stage_history_case_id_idx").on(table.caseId),
]);
