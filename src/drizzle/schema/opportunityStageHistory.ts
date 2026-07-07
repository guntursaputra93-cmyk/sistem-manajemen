import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { opportunities } from "./opportunities";
import { pipelineStages } from "./pipelineStages";
import { users } from "./users";

// Riwayat perpindahan tahap — untuk analitik (berapa lama di tiap tahap, dsb).
// exited_at NULL berarti opportunity masih berdiri di tahap ini sekarang.
export const opportunityStageHistory = pgTable("opportunity_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id, { onDelete: "restrict" }),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
  changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
});
