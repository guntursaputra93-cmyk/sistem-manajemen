import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, organizations, opportunities, outgoingLetters, proposalItems } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createProposalAction } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
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

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href={`/${companySlug}/crm/organisasi`} className="text-sm text-blue-600 hover:underline">&larr; Kembali ke CRM</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Proposal / Penawaran (CRM)</h1>
        <p className="text-gray-500 text-sm mt-1">Proposal adalah surat keluar (jenis: penawaran) dgn item &amp; nilai — kelola item &amp; lifecycle approval di halaman detail surat.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}

      {canCreate && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Buat Proposal Baru</h2>
          {orgList.length === 0 || deptList.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Belum ada organisasi atau departemen. Buat dulu di CRM &rarr; Organisasi / Pengaturan &rarr; Departemen.</p>
          ) : (
            <form action={createProposalAction} className="grid grid-cols-2 gap-4">
              <input type="hidden" name="companySlug" value={companySlug} />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Organisasi</label>
                <select name="organizationId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Departemen (penentu nomor)</label>
                <select name="departmentId" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {deptList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Perihal</label>
                <input name="subject" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                  Buat Draft Proposal
                </button>
                <p className="text-xs text-gray-400 italic mt-2">Item proposal &amp; kaitan opportunity ditambahkan di halaman detail surat setelah draft dibuat.</p>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">No. Surat</th>
              <th className="text-left px-4 py-2">Organisasi</th>
              <th className="text-left px-4 py-2">Perihal</th>
              <th className="text-left px-4 py-2">Total Nilai</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {letters.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 italic">Belum ada proposal.</td></tr>
            )}
            {letters.map((letter) => {
              const org = orgList.find((o) => o.id === letter.organizationId);
              const items = allItems.filter((i) => i.outgoingLetterId === letter.id);
              const total = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
              const opp = oppList.find((o) => o.id === items.find((i) => i.opportunityId)?.opportunityId);
              return (
                <tr key={letter.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/${companySlug}/surat-keluar/${letter.id}`} className="text-blue-600 hover:underline">{letter.letterNumber ?? "(draft)"}</Link>
                  </td>
                  <td className="px-4 py-2">{org?.name ?? "-"}</td>
                  <td className="px-4 py-2">{letter.subject}{opp ? ` (opportunity: ${opp.title})` : ""}</td>
                  <td className="px-4 py-2">{total > 0 ? `Rp ${total.toLocaleString("id-ID")}` : "-"}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[letter.status] ?? letter.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
