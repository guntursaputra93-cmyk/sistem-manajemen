import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalTemplates, journalTemplateLines, chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import {
  updateJournalTemplate,
  deleteJournalTemplate,
  addJournalTemplateLine,
  updateJournalTemplateLine,
  deleteJournalTemplateLine,
} from "../actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { RowDrawer } from "@/components/ui/RowDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

export default async function JournalTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug, id } = await params;
  const { error, success } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "VIEW_JOURNAL_ENTRIES")) {
    redirect(`/${companySlug}/dashboard`);
  }
  const canManage = hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES");

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const [template] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(journalTemplates).where(and(eq(journalTemplates.id, id), eq(journalTemplates.companyId, company.id)))
  );
  if (!template) notFound();

  const [lines, postingAccounts] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ line: journalTemplateLines, account: chartOfAccounts })
        .from(journalTemplateLines)
        .innerJoin(chartOfAccounts, eq(journalTemplateLines.accountId, chartOfAccounts.id))
        .where(eq(journalTemplateLines.templateId, template.id))
        .orderBy(asc(journalTemplateLines.lineOrder))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, company.id), eq(chartOfAccounts.isHeader, false), eq(chartOfAccounts.isActive, true)))
        .orderBy(asc(chartOfAccounts.code))
    ),
  ]);

  const debitCount = lines.filter((l) => l.line.side === "debit").length;
  const creditCount = lines.filter((l) => l.line.side === "kredit").length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum" },
          { label: "Template", href: `/${companySlug}/keuangan/jurnal/template` },
          { label: template.name },
        ]}
        title={template.name}
        description={template.description ?? "Kelola baris debit/kredit template ini."}
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Edit Template"
              title="Edit Template"
              description="Ubah nama, keterangan, atau status template."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={updateJournalTemplate}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <FormSection title="Detail Template">
                  <FormField label="Nama *" full>
                    <input autoComplete="off" name="name" defaultValue={template.name} required className={inputClass} />
                  </FormField>
                  <FormField label="Keterangan" full optional>
                    <input autoComplete="off" name="description" defaultValue={template.description ?? ""} className={inputClass} />
                  </FormField>
                  <FormField label="Status" full>
                    <select name="isActive" defaultValue={String(template.isActive)} className={inputClass}>
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Simpan Perubahan" />
              </form>
              <form action={deleteJournalTemplate} className="mt-4 border-t border-ink-muted/12 pt-4">
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <p className="mb-2 text-[11px] text-ink-muted">
                  Menghapus template tidak mempengaruhi jurnal yang sudah dibuat darinya.
                </p>
                <button type="submit" className="cursor-pointer text-[13px] font-medium text-destructive hover:underline">
                  Hapus Template
                </button>
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>
      )}

      <Card
        title="Baris Template"
        description={`${lines.length} baris · ${debitCount} debit · ${creditCount} kredit. Nominal diisi nanti saat template dipakai di Jurnal Cepat.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
              <tr>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tl-[14px] w-[60px]">#</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Akun</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Sisi</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Keterangan</th>
                {canManage && <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tr-[14px] w-[80px]">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-ink-muted italic">
                    Belum ada baris. Tambahkan minimal 2 baris (debit &amp; kredit) di bawah.
                  </td>
                </tr>
              )}
              {lines.map((l, i) => (
                <tr key={l.line.id} className="border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors">
                  <td className="px-4 py-3 text-ink-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{l.account.code}</span> · {l.account.name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={l.line.side === "debit" ? "sage" : "dusty-rose"}>{l.line.side === "debit" ? "Debit" : "Kredit"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{l.line.description ?? "-"}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <RowDrawer
                        triggerLabel="Edit"
                        title={`Edit Baris ${i + 1}`}
                        description="Perbaiki akun, sisi, atau keterangan baris template ini."
                      >
                        <form action={updateJournalTemplateLine}>
                          <input type="hidden" name="companySlug" value={companySlug} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="templateId" value={template.id} />
                          <input type="hidden" name="lineId" value={l.line.id} />
                          <FormSection title="Detail Baris">
                            <FormField label="Akun *" full>
                              <select name="accountId" required defaultValue={l.line.accountId} className={inputClass}>
                                {postingAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.code} · {a.name}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="Sisi *">
                              <select name="side" required defaultValue={l.line.side} className={inputClass}>
                                <option value="debit">Debit</option>
                                <option value="kredit">Kredit</option>
                              </select>
                            </FormField>
                            <FormField label="Keterangan" full optional>
                              <input autoComplete="off" name="description" defaultValue={l.line.description ?? ""} className={inputClass} />
                            </FormField>
                          </FormSection>
                          <DrawerFooter submitLabel="Simpan Perubahan" />
                        </form>
                        <form action={deleteJournalTemplateLine} className="mt-4 border-t border-ink-muted/12 pt-4">
                          <input type="hidden" name="companySlug" value={companySlug} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="templateId" value={template.id} />
                          <input type="hidden" name="lineId" value={l.line.id} />
                          <button type="submit" className="cursor-pointer text-[13px] font-medium text-destructive hover:underline">
                            Hapus Baris
                          </button>
                        </form>
                      </RowDrawer>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <form action={addJournalTemplateLine} className="mt-4 grid grid-cols-1 gap-3 border-t border-ink-muted/12 pt-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="templateId" value={template.id} />
            <FormField label="Akun *">
              <select name="accountId" required className={inputClass}>
                <option value="">— pilih akun posting —</option>
                {postingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Sisi *">
              <select name="side" required defaultValue="debit" className={inputClass}>
                <option value="debit">Debit</option>
                <option value="kredit">Kredit</option>
              </select>
            </FormField>
            <FormField label="Keterangan" optional>
              <input autoComplete="off" name="description" placeholder="opsional" className={inputClass} />
            </FormField>
            <button type="submit" className="h-[38px] rounded-[9px] bg-sage-deep px-4 text-[13px] font-bold text-white transition-colors hover:bg-sage-deep/90">
              Tambah Baris
            </button>
          </form>
        )}
      </Card>

      <div>
        <Link href={`/${companySlug}/keuangan/jurnal/template`} className="text-[13px] text-sage-deep hover:underline">
          ← Kembali ke daftar template
        </Link>
      </div>
    </div>
  );
}
