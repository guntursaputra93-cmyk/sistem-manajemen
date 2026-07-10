import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies, departments, users, incomingLetters, letterDispositions } from "@/drizzle/schema";
import { hasPermission, ROLE_LABEL } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { addDisposition } from "../actions";
import { TrailStepper, type TrailStep } from "@/components/ui/TrailStepper";

const STATUS_LABEL: Record<string, string> = {
  baru: "Baru",
  didisposisikan: "Didisposisikan",
  selesai: "Selesai",
  diarsipkan: "Diarsipkan",
};

export default async function SuratMasukDetailPage({
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

  if (!hasPermission(session.user.role, "VIEW_INCOMING_LETTERS")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "surat_masuk_keluar", companySlug }));

  const [letter] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(incomingLetters).where(and(eq(incomingLetters.id, id), eq(incomingLetters.companyId, company.id)))
  );
  if (!letter) notFound();

  const [dispositions, deptList, userList] = await Promise.all([
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(letterDispositions).where(eq(letterDispositions.incomingLetterId, id)).orderBy(asc(letterDispositions.stepOrder))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(departments).where(eq(departments.companyId, company.id)).orderBy(asc(departments.name))
    ),
    withTenantContext(tenantContext, (tx) =>
      tx.select().from(users).where(eq(users.companyId, company.id)).orderBy(asc(users.fullName))
    ),
  ]);

  const canDispose = hasPermission(session.user.role, "CREATE_DISPOSITION");

  const isLetterResolved = letter.status === "selesai" || letter.status === "diarsipkan";
  const dispositionSteps: TrailStep[] = dispositions.map((d, i) => {
    const targetDept = deptList.find((dept) => dept.id === d.targetDepartmentId);
    const targetUser = userList.find((u) => u.id === d.targetUserId);
    const label =
      [targetDept ? `Departemen ${targetDept.name}` : null, targetUser ? targetUser.fullName : null].filter(Boolean).join(" — ") ||
      `Langkah ${d.stepOrder}`;
    const isLast = i === dispositions.length - 1;
    return {
      id: d.id,
      label,
      description: d.instruction ?? undefined,
      status: isLast && !isLetterResolved ? "pending" : "done",
    };
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/${companySlug}/surat-masuk`} className="text-sm text-sage-deep hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold text-ink mt-2">{letter.agendaNumber}</h1>
        <p className="text-ink-muted text-sm mt-1">
          {letter.sender} — {letter.subject}
        </p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && (
        <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>
      )}

      <section className="bg-surface border border-ink-muted/10 rounded-xl p-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-ink-muted">Tanggal Surat</span>
          <p className="text-ink">{letter.letterDate}</p>
        </div>
        <div>
          <span className="text-ink-muted">Tanggal Diterima</span>
          <p className="text-ink">{letter.receivedDate}</p>
        </div>
        <div>
          <span className="text-ink-muted">Status</span>
          <p className="text-ink">{STATUS_LABEL[letter.status] ?? letter.status}</p>
        </div>
      </section>

      <section className="bg-surface border border-ink-muted/10 rounded-xl p-6">
        <h2 className="font-semibold text-ink mb-4">Riwayat Disposisi</h2>
        {dispositions.length === 0 ? (
          <p className="text-sm text-ink-muted italic">Belum ada disposisi.</p>
        ) : (
          <TrailStepper steps={dispositionSteps} orientation="vertical" />
        )}
      </section>

      {canDispose && (
        <section className="bg-surface border border-ink-muted/10 rounded-xl p-6">
          <h2 className="font-semibold text-ink mb-4">Tambah Disposisi</h2>
          <form action={addDisposition} className="space-y-4">
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="incomingLetterId" value={letter.id} />
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ke Departemen (opsional)</label>
              <select name="targetDepartmentId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface">
                <option value="">-- tidak ada --</option>
                {deptList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Ke Orang (opsional)</label>
              <select name="targetUserId" className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface">
                <option value="">-- tidak ada --</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-ink-muted mb-1">Instruksi (opsional)</label>
              <textarea name="instruction" rows={2} className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface" />
            </div>
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Kirim Disposisi
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
