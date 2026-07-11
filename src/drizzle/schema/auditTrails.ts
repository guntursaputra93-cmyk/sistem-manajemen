import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
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
}, (table) => [
  // Backlog performa — companyId difilter tiap kali halaman audit trail per-company
  // dibuka (VIEW_AUDIT_TRAIL), createdAt dipakai utk query rentang waktu/urutan
  // terbaru (termasuk oleh super_admin lintas company, jadi index terpisah, bukan
  // digabung 1 composite dengan companyId).
  index("audit_trails_company_id_idx").on(table.companyId),
  index("audit_trails_created_at_idx").on(table.createdAt),
  index("audit_trails_user_id_idx").on(table.userId),
]);
