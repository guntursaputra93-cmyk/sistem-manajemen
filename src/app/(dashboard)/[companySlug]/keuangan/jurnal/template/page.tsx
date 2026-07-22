import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalTemplates, journalTemplateLines } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createJournalTemplate } from "./actions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

export default async function JournalTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { companySlug } = await params;
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

  const [templateList, lineList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(journalTemplates).where(eq(journalTemplates.companyId, company.id)).orderBy(asc(journalTemplates.name))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select({ templateId: journalTemplateLines.templateId }).from(journalTemplateLines).where(eq(journalTemplateLines.companyId, company.id))
    ),
  ]);

  const lineCount = new Map<string, number>();
  for (const l of lineList) lineCount.set(l.templateId, (lineCount.get(l.templateId) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Keuangan" }, { label: "Jurnal Umum" }, { label: "Template" }]}
        title="Template Jurnal"
        description="Resep jurnal yang sering dipakai — dipakai di Jurnal Cepat untuk input sekali klik tanpa memilih akun/sisi ulang."
        actions={
          canManage && (
            <FormDrawer
              buttonLabel="Tambah Template"
              title="Tambah Template Jurnal"
              description="Buat nama dulu, lalu tambahkan baris debit/kredit di halaman template."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              <form action={createJournalTemplate}>
                <input type="hidden" name="companySlug" value={companySlug} />
                <input type="hidden" name="companyId" value={company.id} />
                <FormSection title="Detail Template">
                  <FormField label="Nama *" full>
                    <input autoComplete="off" name="name" required placeholder="mis. Setor tunai ke bank" className={inputClass} />
                  </FormField>
                  <FormField label="Keterangan" full optional>
                    <input autoComplete="off" name="description" placeholder="mis. Penyetoran kas ke rekening bank operasional" className={inputClass} />
                  </FormField>
                </FormSection>
                <DrawerFooter submitLabel="Buat Template" />
              </form>
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {templateList.length === 0 ? (
        <EmptyState message="Belum ada template. Tambahkan template untuk transaksi yang sering berulang supaya input jurnal jauh lebih cepat." />
      ) : (
        <div className="bg-surface rounded-[14px] border border-ink-muted/10 shadow-[0_1px_4px_rgba(51,57,59,0.04)] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-muted text-[11.5px] uppercase tracking-wider bg-[#FAF1E5]">
              <tr>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tl-[14px]">Nama Template</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Keterangan</th>
                <th className="text-left px-4 py-[11px] font-bold border-b border-ink-muted/12">Baris</th>
                <th className={`text-left px-4 py-[11px] font-bold border-b border-ink-muted/12 ${canManage ? "" : "rounded-tr-[14px]"}`}>Status</th>
                {canManage && <th className="text-right px-4 py-[11px] font-bold border-b border-ink-muted/12 rounded-tr-[14px] w-[80px]">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {templateList.map((t) => (
                <tr key={t.id} className={`border-t border-ink-muted/8 first:border-t-0 hover:bg-sage/10 transition-colors ${t.isActive ? "" : "opacity-55"}`}>
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{t.description ?? "-"}</td>
                  <td className="px-4 py-3">{lineCount.get(t.id) ?? 0} baris</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.isActive ? "sage" : "destructive"}>{t.isActive ? "Aktif" : "Nonaktif"}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Link href={`/${companySlug}/keuangan/jurnal/template/${t.id}`} className="text-[13px] font-medium text-sage-deep hover:underline">
                        Edit
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
