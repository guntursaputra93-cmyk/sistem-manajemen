import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { caseExternalSubmissions } from "./caseExternalSubmissions";
import { users } from "./users";

// Riwayat update status pengajuan dari staf (langkah 1.5) — menjawab kebutuhan
// "laporan staf sampai mana prosesnya". status pakai text bebas (bukan enum),
// sengaja generik lintas firma.
export const caseExternalSubmissionHistory = pgTable("case_external_submission_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").notNull().references(() => caseExternalSubmissions.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  notes: text("notes"),
  reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_external_submission_history_company_id_idx").on(table.companyId),
  index("case_external_submission_history_submission_id_idx").on(table.submissionId),
]);
