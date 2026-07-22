import { pgTable, pgEnum, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { organizations } from "./organizations";
import { opportunities } from "./opportunities";
import { cases } from "./cases";
import { users } from "./users";

export const activityTypeEnum = pgEnum("activity_type", ["telepon", "meeting", "email", "lainnya"]);

// Log interaksi per organisasi/opportunity (spesifikasi CRM Bagian 2.5).
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  // Case Management (langkah 1.2) — log aktivitas bisa nempel langsung ke sebuah case,
  // bukan hanya organization/opportunity. Nullable; set null kalau case terhapus supaya
  // riwayat aktivitas tidak ikut hilang.
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  activityType: activityTypeEnum("activity_type").notNull(),
  notes: text("notes"),
  activityDate: date("activity_date").notNull(),
  // Dipakai utk reminder follow-up berikutnya (spesifikasi CRM Bagian 2.5), nullable.
  nextFollowupDate: date("next_followup_date"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
