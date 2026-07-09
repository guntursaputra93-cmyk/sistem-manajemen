import { pgTable, uuid, text, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { calibrationMeetings } from "./calibrationMeetings";
import { employees } from "./employees";

export const calibrationAttendees = pgTable("calibration_attendees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  meetingId: uuid("meeting_id").notNull().references(() => calibrationMeetings.id, { onDelete: "cascade" }),
  // Nullable + fallback ke teks bebas: peserta rapat kalibrasi tidak selalu karyawan
  // terdaftar di sistem ini (mis. asesor eksternal) — lihat CHECK di bawah.
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  attendeeName: text("attendee_name"),
  attendeeRole: text("attendee_role"),
  signed: boolean("signed").notNull().default(false),
}, (table) => [
  check("calibration_attendees_employee_or_name", sql`${table.employeeId} IS NOT NULL OR ${table.attendeeName} IS NOT NULL`),
]);
