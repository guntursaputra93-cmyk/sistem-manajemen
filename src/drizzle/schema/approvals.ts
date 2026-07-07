import { pgTable, pgEnum, uuid, text, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { departments } from "./departments";
import { users, userRoleEnum } from "./users";

export const approvalEntityTypeEnum = pgEnum("approval_entity_type", ["surat_keluar", "nota_dinas", "dokumen"]);
export const approvalStepStatusEnum = pgEnum("approval_step_status", ["pending", "approved", "rejected"]);

// Konfigurasi jenjang approval, fleksibel per jenis (jenis_key bebas diisi admin,
// mis. "internal"/"eksternal" untuk surat_keluar) — lihat spesifikasi Bagian 2.1.
export const approvalFlows = pgTable("approval_flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  appliesTo: approvalEntityTypeEnum("applies_to").notNull(),
  jenisKey: text("jenis_key").notNull(),
  stepOrder: integer("step_order").notNull(),
  // Tepat salah satu wajib terisi — role generik (mis. department_head, otomatis
  // dicocokkan ke departemen pemilik entity) ATAU 1 orang spesifik. Lihat CHECK di bawah.
  requiredRole: userRoleEnum("required_role"),
  requiredApproverUserId: uuid("required_approver_user_id").references(() => users.id, { onDelete: "restrict" }),
}, (table) => [
  unique("approval_flows_company_applies_jenis_step_unique").on(
    table.companyId,
    table.appliesTo,
    table.jenisKey,
    table.stepOrder
  ),
  check(
    "approval_flows_role_xor_user",
    sql`(${table.requiredRole} IS NOT NULL) <> (${table.requiredApproverUserId} IS NOT NULL)`
  ),
]);

// Riwayat approval aktual per entity (surat keluar/nota dinas/dokumen tertentu).
export const approvalSteps = pgTable("approval_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  entityType: approvalEntityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  // Disalin dari entity saat step di-inisialisasi — dipakai untuk mencari kembali
  // baris approval_flows yang jadi acuan jenjang ini (role/orang mana yang berhak).
  jenisKey: text("jenis_key").notNull(),
  // Departemen pemilik entity (kalau ada) — dipakai resolve eligibility saat
  // required_role = department_head (harus kepala departemen INI, bukan sembarang).
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  stepOrder: integer("step_order").notNull(),
  approverId: uuid("approver_id").references(() => users.id, { onDelete: "set null" }),
  status: approvalStepStatusEnum("status").notNull().default("pending"),
  catatan: text("catatan"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
}, (table) => [
  unique("approval_steps_entity_step_unique").on(table.entityType, table.entityId, table.stepOrder),
]);
