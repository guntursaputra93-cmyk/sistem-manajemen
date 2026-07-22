import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, journalTemplates, journalTemplateLines, chartOfAccounts, organizations } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { openItemTriggerSide } from "@/lib/finance/openItems";
import { QuickJournalForm } from "./QuickJournalForm";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function QuickJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ error?: string; template?: string }>;
}) {
  const { companySlug } = await params;
  const { error, template: templateId } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  if (!hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`/${companySlug}/keuangan/jurnal`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "keuangan", companySlug }));

  const activeTemplates = await withTenantContext(tenantContext, (tx) =>
    tx
      .select()
      .from(journalTemplates)
      .where(and(eq(journalTemplates.companyId, company.id), eq(journalTemplates.isActive, true)))
      .orderBy(asc(journalTemplates.name))
  );

  const selected = templateId ? activeTemplates.find((t) => t.id === templateId) : undefined;

  const selectedLines = selected
    ? await withTenantContext(tenantContext, (tx) =>
        tx
          .select({ line: journalTemplateLines, account: chartOfAccounts })
          .from(journalTemplateLines)
          .innerJoin(chartOfAccounts, eq(journalTemplateLines.accountId, chartOfAccounts.id))
          .where(eq(journalTemplateLines.templateId, selected.id))
          .orderBy(asc(journalTemplateLines.lineOrder))
      )
    : [];

  // Rekanan/klien CRM untuk menautkan transaksi terbuka (Item 5a).
  const orgRows = await withTenantContext(tenantContext, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name, partnerType: organizations.partnerType })
      .from(organizations)
      .where(eq(organizations.companyId, company.id))
      .orderBy(asc(organizations.name))
  );
  // Tipe ikut di label supaya staf tidak salah pilih klien vs pemasok.
  const orgList = orgRows.map((o) => ({
    id: o.id,
    name: o.partnerType === "klien" ? o.name : `${o.name} · ${o.partnerType === "pemasok" ? "Pemasok" : "Klien+Pemasok"}`,
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Keuangan" },
          { label: "Jurnal Umum", href: `/${companySlug}/keuangan/jurnal` },
          { label: "Jurnal Cepat" },
        ]}
        title="Jurnal Cepat"
        description="Pilih template, isi nominal, sistem membuat & memposting jurnalnya sekaligus — tanpa memilih akun/sisi satu per satu."
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">{error}</div>
      )}

      {activeTemplates.length === 0 ? (
        <EmptyState message="Belum ada template aktif. Buat template dulu di menu Template Jurnal supaya bisa dipakai di sini." />
      ) : !selected ? (
        <Card title="Pilih Template" description="Klik salah satu template untuk mulai mengisi nominal.">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {activeTemplates.map((t) => (
              <Link
                key={t.id}
                href={`/${companySlug}/keuangan/jurnal/cepat?template=${t.id}`}
                className="rounded-[12px] border border-ink-muted/12 bg-bg-base px-4 py-3 transition-colors hover:border-sage-deep/40 hover:bg-sage/10"
              >
                <div className="font-semibold text-ink">{t.name}</div>
                {t.description && <div className="mt-0.5 text-[12px] text-ink-muted">{t.description}</div>}
              </Link>
            ))}
          </div>
        </Card>
      ) : selectedLines.length < 2 ? (
        <Card title={selected.name}>
          <p className="text-[13px] text-ink-muted">
            Template ini belum punya minimal 2 baris.{" "}
            <Link href={`/${companySlug}/keuangan/jurnal/template/${selected.id}`} className="text-sage-deep hover:underline">
              Lengkapi barisnya dulu
            </Link>
            .
          </p>
        </Card>
      ) : (
        <Card title={selected.name} description={selected.description ?? undefined}>
          <div className="mb-3">
            <Link href={`/${companySlug}/keuangan/jurnal/cepat`} className="text-[13px] text-sage-deep hover:underline">
              ← Ganti template
            </Link>
          </div>
          <QuickJournalForm
            companySlug={companySlug}
            companyId={company.id}
            templateId={selected.id}
            templateName={selected.name}
            organizations={orgList}
            defaultDate={today}
            lines={selectedLines.map((l) => ({
              id: l.line.id,
              accountLabel: `${l.account.code} · ${l.account.name}`,
              side: l.line.side,
              description: l.line.description,
              openItemSide: l.account.isOpenItem ? openItemTriggerSide(l.account.openItemType) : null,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
