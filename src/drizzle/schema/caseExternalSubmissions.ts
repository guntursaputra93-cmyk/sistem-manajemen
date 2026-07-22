import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { cases } from "./cases";
import { users } from "./users";

// Pengajuan ke pihak luar apa pun (langkah 1.5) — bukan hanya regulator/pemerintah,
// bisa lembaga akreditasi/asosiasi profesi/asuransi. external_party_name/status pakai
// text bebas (bukan enum), sengaja generik lintas firma.
export const caseExternalSubmissions = pgTable("case_external_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  externalPartyName: text("external_party_name").notNull(),
  submissionType: text("submission_type"),
  trackingNumber: text("tracking_number"),
  status: text("status").notNull().default("draft"),
  submittedDate: date("submitted_date"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_external_submissions_company_id_idx").on(table.companyId),
  index("case_external_submissions_case_id_idx").on(table.caseId),
]);
