import { pgTable, pgEnum, uuid, text, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";
import { departments } from "./departments";

export const employeeEmploymentStatusEnum = pgEnum("employee_employment_status", [
  "aktif",
  "cuti_panjang",
  "resign",
  "diberhentikan",
]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Nullable + unique: tidak semua karyawan punya akun login di sistem ini.
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  // Nomor KTP — PII sensitif, unique per company (bukan global, mengikuti pola
  // departments.code), dikecualikan dari Sentry via lib/sentry/scrub.ts.
  nik: text("nik").notNull(),
  fullName: text("full_name").notNull(),
  // Email kontak karyawan — informasional saja, TIDAK sama dengan users.email
  // (kredensial login). Nullable, tanpa unique constraint (bukan identitas
  // sistem). Dipakai untuk prefill form pembuatan akun saat admin klik
  // "Berikan Akses Sistem" di halaman detail karyawan.
  email: text("email"),
  // Denormalized dari position_history (baris status='active' terkini) — supaya
  // listing tidak perlu join tiap saat. Disinkronkan oleh changeEmployeePosition()
  // di lib/hr/employees.ts, jangan diupdate langsung di luar fungsi itu.
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  currentPositionTitle: text("current_position_title"),
  employmentStatus: employeeEmploymentStatusEnum("employment_status").notNull().default("aktif"),
  joinDate: date("join_date").notNull(),
  resignDate: date("resign_date"),
  phone: text("phone"),
  address: text("address"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  birthDate: date("birth_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("employees_company_id_nik_unique").on(table.companyId, table.nik),
  uniqueIndex("employees_user_id_unique").on(table.userId),
]);
