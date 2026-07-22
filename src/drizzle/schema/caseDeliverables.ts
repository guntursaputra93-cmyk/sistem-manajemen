import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { cases } from "./cases";
import { organizations } from "./organizations";
import { attachments } from "./attachments";
import { users } from "./users";

// Hasil akhir yang diserahkan ke klien (langkah 1.5) — sertifikat/laporan/dokumen apa
// pun tergantung jenis firma. deliverable_type/status pakai text bebas (bukan enum),
// sengaja generik lintas firma.
export const caseDeliverables = pgTable("case_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deliverableType: text("deliverable_type").notNull(),
  deliverableNumber: text("deliverable_number").unique(),
  barcodeValue: text("barcode_value"),
  issuedDate: date("issued_date"),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("draft"),
  // Lampiran file hasil (mis. PDF sertifikat) di tabel attachments yang sudah ada.
  fileAttachmentId: uuid("file_attachment_id").references(() => attachments.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("case_deliverables_company_id_idx").on(table.companyId),
  index("case_deliverables_case_id_idx").on(table.caseId),
  index("case_deliverables_organization_id_idx").on(table.organizationId),
]);
