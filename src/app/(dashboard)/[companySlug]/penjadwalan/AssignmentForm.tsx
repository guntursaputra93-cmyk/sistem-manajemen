"use client";

import { useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { createServiceAssignment } from "./actions";

export type ContractOption = {
  id: string;
  label: string;
  organizationIndustry: string | null;
};

export type EmployeeOption = {
  id: string;
  fullName: string;
  activeSectorSchemes: string[];
};

// Peringatan kompetensi dihitung ulang di sini (client) supaya admin lihat
// sebelum submit — server action createServiceAssignment MENGHITUNG ULANG hal
// yang sama (jangan percaya nilai dari client), ini cuma untuk UX. Logikanya
// sengaja sesederhana text matching, sama seperti computeCompetencyWarnings
// di lib/scheduling/assignments.ts — JANGAN dibuat lebih rumit di sini.
function computeWarnings(contract: ContractOption | undefined, employee: EmployeeOption | undefined): string[] {
  if (!contract || !employee) return [];
  const warnings: string[] = [];

  if (employee.activeSectorSchemes.length === 0) {
    warnings.push("Karyawan ini belum punya kompetensi berstatus aktif tercatat di sistem.");
    return warnings;
  }

  const industry = contract.organizationIndustry?.trim().toLowerCase() || null;
  if (industry) {
    const hasMatch = employee.activeSectorSchemes.some((scheme) => {
      const s = scheme.trim().toLowerCase();
      if (!s) return false;
      return s.includes(industry) || industry.includes(s);
    });
    if (!hasMatch) {
      warnings.push(`Tidak ada kompetensi aktif dengan skema sektor yang cocok dengan industri klien ("${contract.organizationIndustry}").`);
    }
  }

  return warnings;
}

export function AssignmentForm({
  companySlug,
  companyId,
  contracts,
  employees,
  personLabel,
}: {
  companySlug: string;
  companyId: string;
  contracts: ContractOption[];
  employees: EmployeeOption[];
  personLabel: string;
}) {
  const [contractId, setContractId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);

  const selectedContract = contracts.find((c) => c.id === contractId);
  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const warnings = useMemo(() => computeWarnings(selectedContract, selectedEmployee), [selectedContract, selectedEmployee]);
  const canSubmit = warnings.length === 0 || acknowledge;

  return (
    <form action={createServiceAssignment} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <input type="hidden" name="companySlug" value={companySlug} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="acknowledgeWarning" value={warnings.length > 0 && acknowledge ? "true" : "false"} />

      <div>
        <label className="block text-[10px] font-semibold text-ink-muted mb-1">Contract</label>
        <select
          name="contractId"
          required
          value={contractId}
          onChange={(e) => {
            setContractId(e.target.value);
            setAcknowledge(false);
          }}
          className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
        >
          <option value="">-- pilih contract aktif --</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-ink-muted mb-1">{personLabel}</label>
        <select
          name="employeeId"
          required
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            setAcknowledge(false);
          }}
          className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
        >
          <option value="">-- pilih karyawan --</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Mulai</label>
        <DatePicker name="assignmentDate" required />
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-ink-muted mb-1">Tanggal Selesai (opsional)</label>
        <DatePicker name="endDate" />
      </div>

      <div className="col-span-full">
        <label className="block text-[10px] font-semibold text-ink-muted mb-1">Lokasi (opsional)</label>
        <input autoComplete="off" name="location" placeholder="mis. Kantor klien / lokasi audit" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base" />
      </div>

      {warnings.length > 0 && (
        <div className="col-span-full bg-dusty-rose/15 border border-dusty-rose-deep/30 rounded-lg px-4 py-3 text-[11px] text-ink space-y-2">
          <p className="font-bold">Peringatan kompetensi (tidak memblokir, hanya konfirmasi):</p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span>Saya memahami peringatan di atas dan tetap ingin melanjutkan penugasan ini.</span>
          </label>
        </div>
      )}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11.5px] font-bold px-[18px] py-[7px] rounded-[9px] transition-colors shadow-[0_3px_10px_rgba(74,103,65,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Buat Penugasan
        </button>
      </div>
    </form>
  );
}
