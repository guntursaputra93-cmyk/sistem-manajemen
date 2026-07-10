import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, employees, employeeSalaryStructures, salaryComponents } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { addSalaryStructure, endSalaryStructure } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DatePicker } from "@/components/ui/DatePicker";

const TYPE_LABEL: Record<string, string> = { pendapatan: "Pendapatan", potongan: "Potongan" };

export default async function StrukturGajiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; employeeId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, employeeId } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_EMPLOYEE_SALARY_STRUCTURE")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "sdm_payroll", companySlug }));

  const [employee] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.companyId, company.id)))
  );
  if (!employee) notFound();

  const [structureRows, componentList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(employeeSalaryStructures).where(eq(employeeSalaryStructures.employeeId, employee.id)).orderBy(asc(employeeSalaryStructures.effectiveDate))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(salaryComponents).where(eq(salaryComponents.companyId, company.id)).orderBy(asc(salaryComponents.name))),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const columns: DataTableColumn<(typeof structureRows)[number]>[] = [
    { key: "component", header: "Komponen", render: (s) => componentList.find((c) => c.id === s.salaryComponentId)?.name ?? "-" },
    {
      key: "type",
      header: "Tipe",
      render: (s) => {
        const comp = componentList.find((c) => c.id === s.salaryComponentId);
        return comp ? <Badge variant={comp.componentType === "pendapatan" ? "sage" : "dusty-rose"}>{TYPE_LABEL[comp.componentType]}</Badge> : "-";
      },
    },
    { key: "amount", header: "Nominal", render: (s) => `Rp ${Number(s.salaryAmount).toLocaleString("id-ID")}` },
    { key: "effective", header: "Efektif Sejak", render: (s) => s.effectiveDate },
    { key: "end", header: "Berakhir", render: (s) => s.endDate ?? "-" },
    {
      key: "status",
      header: "Status",
      render: (s) => (!s.endDate || s.endDate >= todayStr ? <Badge variant="sage">Aktif</Badge> : <Badge variant="dusty-rose">Berakhir</Badge>),
    },
    {
      key: "actions",
      header: "Aksi",
      render: (s) =>
        !s.endDate ? (
          <details>
            <summary className="text-sage-deep hover:underline text-xs cursor-pointer inline">Akhiri</summary>
            <form action={endSalaryStructure} className="mt-2 space-y-2 w-56">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="employeeId" value={employee.id} />
              <input type="hidden" name="structureId" value={s.id} />
              <DatePicker name="endDate" required />
              <button type="submit" className="bg-destructive hover:bg-destructive/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Simpan
              </button>
            </form>
          </details>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Struktur Gaji — {employee.fullName}</h1>
        <p className="text-sm text-ink-muted mt-1">{employee.currentPositionTitle ?? "-"}</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <Card title="Tambah Komponen Gaji">
        <form action={addSalaryStructure} className="grid grid-cols-3 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="employeeId" value={employee.id} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Komponen</label>
            <select name="salaryComponentId" required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface">
              <option value="">-- pilih --</option>
              {componentList.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({TYPE_LABEL[c.componentType]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nominal (Rp)</label>
            <input name="salaryAmount" type="number" step="0.01" min={0} required className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Efektif Sejak</label>
            <DatePicker name="effectiveDate" required />
          </div>
          <div className="col-span-3">
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <DataTable columns={columns} rows={structureRows} rowKey={(s) => s.id} emptyMessage="Belum ada komponen gaji untuk karyawan ini." />
    </div>
  );
}
