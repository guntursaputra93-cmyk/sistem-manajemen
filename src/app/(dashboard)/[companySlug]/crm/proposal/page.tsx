import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, organizations, opportunities, outgoingLetters, proposalItems } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createProposalAction } from "./actions";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "powder-blue",
  menunggu_approval: "dusty-rose",
  disetujui: "sage",
  terkirim: "sage",
  ditolak: "destructive",
};

export default async function ProposalPage({
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

  if (!hasPermission(session.user.role, "VIEW_OUTGOING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const [letters, orgList, deptList, oppList, allItems] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(outgoingLetters).where(and(eq(outgoingLetters.companyId, company.id), eq(outgoingLetters.jenisKey, "penawaran"))).orderBy(desc(outgoingLetters.createdAt))
    ),
    withTenantContext(tenantContext, (tx) => tx.select().from(organizations).where(eq(organizations.companyId, company.id)).orderBy(asc(organizations.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))),
    withTenantContext(tenantContext, (tx) => tx.select().from(opportunities).where(eq(opportunities.companyId, company.id))),
    withTenantContext(tenantContext, (tx) => tx.select().from(proposalItems).where(eq(proposalItems.companyId, company.id))),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_OUTGOING_LETTER");

  type ProposalRow = (typeof letters)[number];

  const columns: DataTableColumn<ProposalRow>[] = [
    {
      key: "number",
      header: "No. Surat",
      render: (letter) => (
        <a href={`/${companySlug}/surat-keluar/${letter.id}`} className="font-medium text-sage-deep hover:underline">
          {letter.letterNumber ?? "(draft)"}
        </a>
      ),
    },
    { key: "org", header: "Organisasi", render: (letter) => orgList.find((o) => o.id === letter.organizationId)?.name ?? "-" },
    {
      key: "subject",
      header: "Perihal",
      render: (letter) => {
        const items = allItems.filter((i) => i.outgoingLetterId === letter.id);
        const opp = oppList.find((o) => o.id === items.find((i) => i.opportunityId)?.opportunityId);
        return (
          <>
            {letter.subject}
            {opp ? ` (opportunity: ${opp.title})` : ""}
          </>
        );
      },
    },
    {
      key: "total",
      header: "Total Nilai",
      render: (letter) => {
        const items = allItems.filter((i) => i.outgoingLetterId === letter.id);
        const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
        return total > 0 ? `Rp ${total.toLocaleString("id-ID")}` : "-";
      },
    },
    {
      key: "status",
      header: "Status",
      render: (letter) => <Badge variant={STATUS_VARIANT[letter.status] ?? "powder-blue"}>{STATUS_LABEL[letter.status] ?? letter.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "CRM" }, { label: "Proposal / Penawaran" }]}
        title="Proposal / Penawaran"
        description="Proposal adalah surat keluar (jenis: penawaran) dgn item & nilai — kelola item & lifecycle approval di halaman detail surat."
        actions={
          canCreate && (
            <FormDrawer
              buttonLabel="Buat Proposal"
              title="Buat Proposal Baru"
              description="Item proposal & kaitan opportunity ditambahkan di halaman detail surat setelah draft dibuat."
              defaultOpen={Boolean(error)}
            >
              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                  {error}
                </div>
              )}
              {orgList.length === 0 || deptList.length === 0 ? (
                <p className="text-[13px] text-ink-muted italic">Belum ada organisasi atau departemen. Buat dulu di CRM &rarr; Organisasi / Pengaturan &rarr; Departemen.</p>
              ) : (
                <form action={createProposalAction}>
                  <input type="hidden" name="companySlug" value={companySlug} />
                  <FormSection title="Detail Proposal">
                    <FormField label="Organisasi *" full>
                      <select name="organizationId" required className={inputClass}>
                        {orgList.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Departemen (penentu nomor) *" full>
                      <select name="departmentId" required className={inputClass}>
                        {deptList.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Perihal *" full>
                      <input autoComplete="off" name="subject" required className={inputClass} />
                    </FormField>
                  </FormSection>
                  <DrawerFooter submitLabel="Buat Draft Proposal" />
                </form>
              )}
            </FormDrawer>
          )
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      <DataTable columns={columns} rows={letters} rowKey={(letter) => letter.id} emptyMessage="Belum ada proposal. Proposal yang dibuat akan muncul di sini." />
    </div>
  );
}
