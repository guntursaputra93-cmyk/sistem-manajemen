import { pgTable, uuid, text, date, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { cases, caseStageEnum } from "./cases";
import { users } from "./users";

// Checklist bebas per case (langkah 1.5) — generik untuk jenis pekerjaan apa pun,
// makanya milestone_key/title/status pakai text bebas, bukan enum (modul sengaja
// generik untuk dijual/disewakan lintas firma).
export const caseMilestones = pgTable("case_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  milestoneKey: text("milestone_key").notNull(),
  title: text("title").notNull(),
  // Opsional — milestone ini bagian dari tahap case yang mana.
  stage: caseStageEnum("stage"),
  // Bebas (pending/in_progress/done/blocked) — text, bukan enum, sengaja generik.
  status: text("status").notNull().default("pending"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_milestones_company_id_idx").on(table.companyId),
  index("case_milestones_case_id_idx").on(table.caseId),
]);
