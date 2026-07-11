import { pgTable, pgEnum, uuid, text, date, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { contracts } from "./contracts";
import { employees } from "./employees";
import { users } from "./users";

export const serviceAssignmentStatusEnum = pgEnum("service_assignment_status", [
  "dijadwalkan",
  "berlangsung",
  "selesai",
  "dibatalkan",
]);

// Fase 4 Penjadwalan Layanan/Sumber Daya. Sumber klien SELALU otomatis dari
// contracts (CRM) — bukan pilih manual dari organizations (keputusan spesifikasi
// Bagian 3). employeeId di sini = personil utama/penanggung jawab penugasan;
// personil tambahan (kalau >1 orang per penugasan) ada di service_assignment_team.
// competencyWarningAcknowledged: audit trail bahwa admin SUDAH lihat warning
// kompetensi kedaluwarsa/tidak cocok tapi tetap lanjut assign — sistem TIDAK
// pernah memblokir, cuma warning (keputusan spesifikasi, jangan diubah jadi block).
export const serviceAssignments = pgTable("service_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "restrict" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  assignmentDate: date("assignment_date").notNull(),
  endDate: date("end_date"),
  // Bisa auto-fill dari contract->organization saat create, tapi field sendiri yang
  // bisa diedit lepas (mis. lokasi audit beda dari alamat kantor klien).
  location: text("location"),
  status: serviceAssignmentStatusEnum("status").notNull().default("dijadwalkan"),
  competencyWarningAcknowledged: boolean("competency_warning_acknowledged").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Backlog performa (audit index pasca Fase 4) — company_id difilter RLS di
  // SEMUA query, contract_id/employee_id difilter langsung di banyak query
  // penjadwalan/kalender/rekap (lihat lib/scheduling/*).
  index("service_assignments_company_id_idx").on(table.companyId),
  index("service_assignments_contract_id_idx").on(table.contractId),
  index("service_assignments_employee_id_idx").on(table.employeeId),
  index("service_assignments_created_by_idx").on(table.createdBy),
]);
