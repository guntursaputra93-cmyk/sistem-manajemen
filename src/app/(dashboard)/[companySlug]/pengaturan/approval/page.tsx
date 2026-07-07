import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, approvalFlows, users } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { addApprovalStep, deleteApprovalStep } from "./actions";

const APPLIES_TO_LABEL: Record<string, string> = {
  surat_keluar: "Surat Keluar",
  nota_dinas: "Nota Dinas",
  dokumen: "Dokumen",
};

export default async function ApprovalFlowsPage({
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

  if (!hasPermission(session.user.role, "MANAGE_APPROVAL_FLOWS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();

  const [flowRows, userRows] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx
        .select({ flow: approvalFlows, approverName: users.fullName })
        .from(approvalFlows)
        .leftJoin(users, eq(approvalFlows.requiredApproverUserId, users.id))
        .where(eq(approvalFlows.companyId, company.id))
        .orderBy(asc(approvalFlows.appliesTo), asc(approvalFlows.jenisKey), asc(approvalFlows.stepOrder))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
  ]);

  const grouped = new Map<string, typeof flowRows>();
  for (const row of flowRows) {
    const key = `${row.flow.appliesTo}::${row.flow.jenisKey}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Jenjang Approval</h1>
        <p className="text-gray-500 text-sm mt-1">
          Atur urutan approval per jenis. Tiap jenis boleh punya jumlah jenjang berbeda.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          Perubahan berhasil disimpan.
        </div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Tambah Jenjang</h2>
        <form action={addApprovalStep} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="companySlug" value={companySlug} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Berlaku untuk</label>
            <select name="appliesTo" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" required>
              <option value="surat_keluar">Surat Keluar</option>
              <option value="nota_dinas">Nota Dinas</option>
              <option value="dokumen">Dokumen</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jenis (bebas, mis. internal)</label>
            <input name="jenisKey" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Urutan Jenjang</label>
            <input
              name="stepOrder"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div />
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
              <input type="radio" name="approverMode" value="role" defaultChecked /> Berdasarkan Role
            </label>
            <select name="requiredRole" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="department_head">Kepala Departemen (departemen pengirim)</option>
              <option value="company_admin">Admin Perusahaan</option>
              <option value="staff">Staff</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
              <input type="radio" name="approverMode" value="user" /> Orang Spesifik
            </label>
            <select name="requiredApproverUserId" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">-- pilih orang --</option>
              {userRows.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Tambah Jenjang
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {grouped.size === 0 && (
          <p className="text-sm text-gray-400 italic">Belum ada konfigurasi approval sama sekali.</p>
        )}
        {[...grouped.entries()].map(([key, rows]) => {
          const [appliesTo, jenisKey] = key.split("::");
          return (
            <div key={key} className="bg-white border border-gray-100 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">
                {APPLIES_TO_LABEL[appliesTo]} — <span className="text-blue-600">{jenisKey}</span>
              </h3>
              <ol className="space-y-2">
                {rows.map(({ flow, approverName }) => (
                  <li key={flow.id} className="flex items-center justify-between text-sm">
                    <span>
                      Jenjang {flow.stepOrder}:{" "}
                      {flow.requiredApproverUserId
                        ? `Orang spesifik — ${approverName ?? "?"}`
                        : ROLE_LABEL[flow.requiredRole as keyof typeof ROLE_LABEL] ?? flow.requiredRole}
                    </span>
                    <form action={deleteApprovalStep}>
                      <input type="hidden" name="companySlug" value={companySlug} />
                      <input type="hidden" name="id" value={flow.id} />
                      <button type="submit" className="text-red-500 hover:underline text-xs">
                        Hapus
                      </button>
                    </form>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>
    </div>
  );
}
