import { pgTable, pgEnum, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Sequence generik utk dokumen finansial bernomor — pola atomik sama persis dengan
// letter_number_sequences (lihat lib/letters/numbering.ts), tapi company-wide, TANPA
// department_id: jurnal/invoice adalah dokumen finansial company, bukan dokumen
// per-departemen seperti surat. 'invoice' (Langkah 4, AR invoices) pakai fungsi
// numbering generik yang sama, bukan tabel baru lagi (spesifikasi Fase 3 Bagian 0:
// "tabel sequence baru atau extend yang ada").
export const financeSequenceTypeEnum = pgEnum("finance_sequence_type", ["jurnal_umum", "invoice"]);

export const financeNumberSequences = pgTable(
  "finance_number_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    sequenceType: financeSequenceTypeEnum("sequence_type").notNull(),
    // Tidak pernah reset — angka urut abadi per company+jenis, sama seperti letter_number_sequences.
    currentNumber: integer("current_number").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("finance_number_sequences_company_type_unique").on(table.companyId, table.sequenceType)]
);
