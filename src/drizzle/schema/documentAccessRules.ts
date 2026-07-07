import { pgTable, pgEnum, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies";
import { documentCategories } from "./documentCategories";
import { documents } from "./documents";
import { departments } from "./departments";
import { userRoleEnum } from "./users";

export const documentAccessScopeEnum = pgEnum("document_access_scope", [
  "semua_staf",
  "departemen_tertentu",
  "role_tertentu",
]);

// Jenjang akses dokumen — DEFAULT FAIL-OPEN (lihat spesifikasi Bagian 2.4):
// tidak ada rule sama sekali untuk suatu kategori/dokumen berarti SEMUA staf
// company tersebut bisa lihat. Admin baru menambah rule kalau mau membatasi.
export const documentAccessRules = pgTable("document_access_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  // Tepat salah satu wajib terisi — category-wide ATAU override 1 dokumen spesifik (lihat CHECK).
  documentCategoryId: uuid("document_category_id").references(() => documentCategories.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  scope: documentAccessScopeEnum("scope").notNull(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }),
  role: userRoleEnum("role"),
}, (table) => [
  check(
    "document_access_rules_target_xor",
    sql`(${table.documentCategoryId} IS NOT NULL) <> (${table.documentId} IS NOT NULL)`
  ),
  check(
    "document_access_rules_scope_fields_consistent",
    sql`(
      (${table.scope} = 'semua_staf' AND ${table.departmentId} IS NULL AND ${table.role} IS NULL)
      OR (${table.scope} = 'departemen_tertentu' AND ${table.departmentId} IS NOT NULL AND ${table.role} IS NULL)
      OR (${table.scope} = 'role_tertentu' AND ${table.role} IS NOT NULL AND ${table.departmentId} IS NULL)
    )`
  ),
]);
