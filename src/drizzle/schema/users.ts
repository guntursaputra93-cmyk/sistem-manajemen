import { pgTable, pgEnum, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { departments } from "./departments";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "company_admin",
  "department_head",
  "staff",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // super_admin biasanya mengelola lintas company, tapi tetap butuh company "rumah"
  // untuk identitas akunnya sendiri — bukan dianggap tidak ber-company sama sekali.
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  // Unique GLOBAL (bukan per-company) — sesuai keputusan: login cuma pakai email+password,
  // tidak ada pemilihan company dulu di halaman login, jadi email harus bisa dicari langsung.
  email: text("email").notNull().unique(),
  // bcrypt, cost factor 12 (lihat src/lib/auth/password.ts)
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  role: userRoleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
