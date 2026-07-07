import { pgTable, pgEnum, uuid, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { organizations } from "./organizations";
import { pipelineStages } from "./pipelineStages";
import { users } from "./users";

export const opportunityStatusEnum = pgEnum("opportunity_status", ["open", "won", "lost"]);

// 1 peluang penjualan (deal) terhadap 1 organisasi (spesifikasi CRM Bagian 2.2).
export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // Restrict, bukan cascade/set null — jangan sampai tahap pipeline terhapus
  // sementara masih ada deal aktif yang berdiri di tahap itu.
  currentStageId: uuid("current_stage_id").notNull().references(() => pipelineStages.id, { onDelete: "restrict" }),
  // numeric, bukan integer — nilai kontrak IDR bisa gampang lewat batas integer
  // Postgres (~2.1 miliar), dan uang tidak boleh kena pembulatan float.
  estimatedValue: numeric("estimated_value", { precision: 15, scale: 2 }),
  expectedCloseDate: date("expected_close_date"),
  // Sales/PIC yang pegang deal ini — dasar filter visibilitas staff/department_head.
  assignedTo: uuid("assigned_to").notNull().references(() => users.id, { onDelete: "restrict" }),
  // Turunan dari current_stage_id (won/lost stage) tapi disimpan eksplisit
  // supaya query dashboard (win rate dst.) tidak perlu join ke pipeline_stages.
  status: opportunityStatusEnum("status").notNull().default("open"),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
