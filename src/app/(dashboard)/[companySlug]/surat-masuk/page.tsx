import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, incomingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createIncomingLetter } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  didisposisikan: "Didisposisikan",
  selesai: "Selesai",
  diarsipkan: "Diarsipkan",
};

export default async function SuratMasukPage({
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

  if (!hasPermission(session.user.role, "VIEW_INCOMING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letters, deptList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(incomingLetters).where(eq(incomingLetters.companyId, company.id)).orderBy(desc(incomingLetters.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
    ),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_INCOMING_LETTER");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Surat Masuk</h1>
        <p className="text-gray-500 text-sm mt-1">Registrasi surat masuk & riwayat disposisi.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      {canCreate && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Registrasi Surat Masuk</h2>
          <form action={createIncomingLetter} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Surat</label>
              <input name="letterDate" type="date" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Diterima</label>
              <input name="receivedDate" type="date" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pengirim</label>
              <input name="sender" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tujuan Awal (opsional)</label>
              <select name="departmentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">-- belum ditentukan --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Perihal</label>
              <input name="subject" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Simpan
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">No. Agenda</th>
              <th className="text-left px-4 py-2">Pengirim</th>
              <th className="text-left px-4 py-2">Perihal</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {letters.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada surat masuk.
                </td>
              </tr>
            )}
            {letters.map((letter) => (
              <tr key={letter.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/${companySlug}/surat-masuk/${letter.id}`} className="text-blue-600 hover:underline">
                    {letter.agendaNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{letter.sender}</td>
                <td className="px-4 py-2">{letter.subject}</td>
                <td className="px-4 py-2">{STATUS_LABEL[letter.status] ?? letter.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
