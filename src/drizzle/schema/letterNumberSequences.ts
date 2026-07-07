import { pgTable, pgEnum, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { departments } from "./departments";

// Counter terpisah antara surat keluar dan nota dinas (default yang dipakai,
// supaya tracing lebih gampang) — lihat spesifikasi Bagian 2.1.
export const sequenceTypeEnum = pgEnum("sequence_type", ["surat_keluar", "nota_dinas"]);

export const letterNumberSequences = pgTable("letter_number_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "cascade" }),
  sequenceType: sequenceTypeEnum("sequence_type").notNull(),
  // Tidak pernah reset — angka urut abadi per company+departemen+jenis.
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("letter_number_sequences_company_dept_type_unique").on(
    table.companyId,
    table.departmentId,
    table.sequenceType
  ),
]);
