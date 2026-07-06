import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

export const auditTrails = pgTable("audit_trails", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: percobaan login gagal untuk email yang TIDAK terdaftar tidak
  // punya company_id yang bisa dirujuk (belum tahu itu email siapa).
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  // Nullable: aksi sistem (bukan aksi user tertentu) atau login gagal untuk email tak dikenal.
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
