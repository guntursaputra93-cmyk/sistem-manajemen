import { pgTable, uuid, text, integer, boolean, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";

// Tahapan pipeline, dikonfigurasi bebas per perusahaan — pola sama seperti
// approval_flows di Fase 1 (spesifikasi CRM Bagian 2.2). Wajib minimal 1
// tahap is_won_stage dan 1 is_lost_stage per company untuk validitas laporan
// — divalidasi di aplikasi (lib/crm/pipeline.ts), bukan di DB, karena aturan
// ini tentang KESELURUHAN baris per company, bukan 1 baris tunggal.
export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  stageKey: text("stage_key").notNull(),
  stageOrder: integer("stage_order").notNull(),
  isWonStage: boolean("is_won_stage").notNull().default(false),
  isLostStage: boolean("is_lost_stage").notNull().default(false),
}, (table) => [
  unique("pipeline_stages_company_key_unique").on(table.companyId, table.stageKey),
  check("pipeline_stages_not_both_won_and_lost", sql`NOT (${table.isWonStage} AND ${table.isLostStage})`),
]);
