import { pgTable, pgEnum, uuid, integer, date, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { documents } from "./documents";
import { attachments } from "./attachments";
import { users } from "./users";

export const documentVersionStatusEnum = pgEnum("document_version_status", [
  "draft",
  "in_review",
  "active",
  "superseded",
  "expired",
]);

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  status: documentVersionStatusEnum("status").notNull().default("draft"),
  fileAttachmentId: uuid("file_attachment_id").references(() => attachments.id, { onDelete: "set null" }),
  effectiveDate: date("effective_date"),
  expiresAt: date("expires_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("document_versions_document_version_number_unique").on(table.documentId, table.versionNumber),
  // Constraint "hanya 1 active per document_id" ditegakkan via partial unique
  // index di migrasi custom (lihat 00xx_rls_and_indexes_documents.sql) —
  // drizzle-kit generate tidak punya API .where() untuk index parsial di versi ini.
]);
