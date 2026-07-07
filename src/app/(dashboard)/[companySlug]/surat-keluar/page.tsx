import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users, outgoingLetters } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { createOutgoingLetter } from "./actions";

const CATEGORY_LABEL: Record<string, string> = {
  surat_keluar: "Surat Keluar",
  nota_dinas: "Nota Dinas",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  menunggu_approval: "Menunggu Approval",
  disetujui: "Disetujui",
  terkirim: "Terkirim",
  ditolak: "Ditolak",
};

export default async function SuratKeluarPage({
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

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letters, deptList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(outgoingLetters).where(eq(outgoingLetters.companyId, company.id)).orderBy(desc(outgoingLetters.createdAt))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
  ]);

  const canCreate = hasPermission(session.user.role, "CREATE_OUTGOING_LETTER");
  const self = userList.find((u) => u.id === session.user.id);
  const restrictOwnDepartment = session.user.role === "staff" || session.user.role === "department_head";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Surat Keluar & Nota Dinas</h1>
        <p className="text-gray-500 text-sm mt-1">Draft, ajukan approval, sampai nomor resmi & terkirim.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      {canCreate && (
        <section className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Buat Draft</h2>
          <form action={createOutgoingLetter} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
              <select name="letterCategory" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
                <option value="surat_keluar">Surat Keluar</option>
                <option value="nota_dinas">Nota Dinas</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Departemen (penentu nomor)</label>
              {restrictOwnDepartment ? (
                <>
                  <input
                    type="hidden"
                    name="departmentId"
                    value={self?.departmentId ?? ""}
                  />
                  <p className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                    {deptList.find((d) => d.id === self?.departmentId)?.name ?? "Belum ada departemen"}
                  </p>
                </>
              ) : (
                <select name="departmentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
                  {deptList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Jenis (bebas, mis. internal)</label>
              <input name="jenisKey" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tujuan Eksternal (utk Surat Keluar)</label>
              <input name="recipient" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tujuan Internal — Departemen (utk Nota Dinas)</label>
              <select name="recipientDepartmentId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">-- tidak ada --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tujuan Internal — Orang (utk Nota Dinas)</label>
              <select name="recipientUserId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Perihal</label>
              <input name="subject" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Isi (opsional)</label>
              <textarea name="bodyContent" rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
                Simpan Draft
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Kategori</th>
              <th className="text-left px-4 py-2">No. Surat</th>
              <th className="text-left px-4 py-2">Perihal</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {letters.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 italic">
                  Belum ada surat.
                </td>
              </tr>
            )}
            {letters.map((letter) => (
              <tr key={letter.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">{CATEGORY_LABEL[letter.letterCategory]}</td>
                <td className="px-4 py-2">
                  <Link href={`/${companySlug}/surat-keluar/${letter.id}`} className="text-blue-600 hover:underline">
                    {letter.letterNumber ?? "(draft)"}
                  </Link>
                </td>
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
