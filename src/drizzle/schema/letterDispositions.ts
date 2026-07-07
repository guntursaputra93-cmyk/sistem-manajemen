import { pgTable, uuid, text, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { incomingLetters } from "./incomingLetters";
import { departments } from "./departments";
import { users } from "./users";

// Riwayat disposisi berantai untuk 1 surat masuk.
export const letterDispositions = pgTable("letter_dispositions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  incomingLetterId: uuid("incoming_letter_id").notNull().references(() => incomingLetters.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "set null" }),
  // Salah satu wajib terisi (lihat CHECK di bawah) — boleh keduanya kalau memang
  // disposisi ditujukan ke 1 departemen DENGAN atensi ke 1 orang tertentu.
  targetDepartmentId: uuid("target_department_id").references(() => departments.id, { onDelete: "set null" }),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
  instruction: text("instruction"),
  stepOrder: integer("step_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("letter_dispositions_letter_step_unique").on(table.incomingLetterId, table.stepOrder),
  check(
    "letter_dispositions_target_required",
    sql`${table.targetDepartmentId} IS NOT NULL OR ${table.targetUserId} IS NOT NULL`
  ),
]);
