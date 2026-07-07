import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getPipelineStages } from "@/lib/crm/pipeline";
import { addPipelineStage, updatePipelineStage, removePipelineStage } from "./actions";

export default async function PipelinePage({
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

  if (!hasPermission(session.user.role, "MANAGE_PIPELINE_STAGES")) {
    redirect(`/${companySlug}/dashboard`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(companies).where(eq(companies.slug, companySlug))
  );
  if (!company) notFound();
  await withTenantContext(tenantContext, (tx) => requireModuleEnabled(tx, { companyId: company.id, moduleKey: "crm", companySlug }));

  const stages = await withTenantContext(tenantContext, (tx) => getPipelineStages(tx, company.id));

  const hasWonStage = stages.some((s) => s.isWonStage);
  const hasLostStage = stages.some((s) => s.isLostStage);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tahap Pipeline (CRM)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Atur tahap pipeline penjualan untuk {company.name}. Bebas dikonfigurasi, urutan menentukan tampilan.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {(!hasWonStage || !hasLostStage) && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3">
          {!hasWonStage && <p>Belum ada tahap "menang" — tandai minimal 1 tahap sebagai tahap menang.</p>}
          {!hasLostStage && <p>Belum ada tahap "hilang" — tandai minimal 1 tahap sebagai tahap hilang.</p>}
        </div>
      )}

      <section className="bg-white border border-gray-100 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Tambah Tahap</h2>
        <form action={addPipelineStage} className="grid grid-cols-4 gap-4 items-end">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Tahap (stage_key)</label>
            <input name="stageKey" required placeholder="mis. lead_baru" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Urutan</label>
            <input name="stageOrder" type="number" min={1} defaultValue={stages.length + 1} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isWonStage" value="true" id="add-won" className="h-4 w-4" />
            <label htmlFor="add-won" className="text-sm text-gray-700">Tahap Menang</label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isLostStage" value="true" id="add-lost" className="h-4 w-4" />
            <label htmlFor="add-lost" className="text-sm text-gray-700">Tahap Hilang</label>
          </div>
          <div className="col-span-4">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Tambah
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {stages.length === 0 && <p className="text-sm text-gray-400 italic">Belum ada tahap pipeline.</p>}
        {stages.map((stage) => (
          <div key={stage.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <form action={updatePipelineStage} className="grid grid-cols-5 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nama Tahap</label>
                <input name="stageKey" defaultValue={stage.stageKey} required className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Urutan</label>
                <input name="stageOrder" type="number" min={1} defaultValue={stage.stageOrder} required className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isWonStage" value="true" defaultChecked={stage.isWonStage} className="h-4 w-4" />
                <label className="text-sm text-gray-700">Menang</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isLostStage" value="true" defaultChecked={stage.isLostStage} className="h-4 w-4" />
                <label className="text-sm text-gray-700">Hilang</label>
              </div>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition">
                Simpan
              </button>
            </form>
            <form action={removePipelineStage} className="mt-2">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <button type="submit" className="text-red-500 hover:underline text-xs">
                Hapus Tahap
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
