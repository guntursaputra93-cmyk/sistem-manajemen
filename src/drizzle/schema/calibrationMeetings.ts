import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

// Notulen rapat kalibrasi tim (kesetaraan penilaian/keputusan antar asesor/auditor) —
// SOP Pemeliharaan Kompetensi Auditor. Bukan per-employee (1 rapat bisa membahas
// banyak orang sekaligus, lihat calibration_attendees) — jadi TIDAK di-scope lewat
// getVisibleEmployeeIds seperti cuti/absensi, cukup company-wide + RBAC role gate
// (department_head/company_admin/super_admin — staff tidak lihat notulen kalibrasi).
export const calibrationMeetings = pgTable("calibration_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  meetingDate: date("meeting_date").notNull(),
  locationOrMedia: text("location_or_media"),
  leaderUserId: uuid("leader_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  notetakerUserId: uuid("notetaker_user_id").references(() => users.id, { onDelete: "set null" }),
  agenda: text("agenda"),
  discussionNotes: text("discussion_notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
