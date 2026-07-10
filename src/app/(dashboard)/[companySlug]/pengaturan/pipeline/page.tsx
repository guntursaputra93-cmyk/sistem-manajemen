import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getPipelineStages } from "@/lib/crm/pipeline";
import { addPipelineStage, updatePipelineStage, removePipelineStage } from "./actions";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-[17px] font-extrabold text-ink">Tahap Pipeline (CRM)</h1>
        <p className="text-sm text-ink-muted mt-1">Atur tahap pipeline penjualan untuk {company.name}. Bebas dikonfigurasi, urutan menentukan tampilan.</p>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 text-ink text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-sm rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {(!hasWonStage || !hasLostStage) && (
        <div className="bg-dusty-rose/20 border border-dusty-rose-deep/20 text-ink text-sm rounded-lg px-4 py-3">
          {!hasWonStage && <p>Belum ada tahap &quot;menang&quot; — tandai minimal 1 tahap sebagai tahap menang.</p>}
          {!hasLostStage && <p>Belum ada tahap &quot;hilang&quot; — tandai minimal 1 tahap sebagai tahap hilang.</p>}
        </div>
      )}

      <Card title="Tambah Tahap">
        <form action={addPipelineStage} className="grid grid-cols-4 gap-4 items-end">
          <input type="hidden" name="companySlug" value={companySlug} />
          <input type="hidden" name="companyId" value={company.id} />
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Tahap (stage_key)</label>
            <input
              name="stageKey"
              required
              placeholder="mis. lead_baru"
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-ink-muted mb-1">Urutan</label>
            <input
              name="stageOrder"
              type="number"
              min={1}
              defaultValue={stages.length + 1}
              required
              className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-surface"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isWonStage" value="true" id="add-won" className="h-4 w-4 accent-sage-deep" />
            <label htmlFor="add-won" className="text-sm text-ink-muted">
              Tahap Menang
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="isLostStage" value="true" id="add-lost" className="h-4 w-4 accent-sage-deep" />
            <label htmlFor="add-lost" className="text-sm text-ink-muted">
              Tahap Hilang
            </label>
          </div>
          <div className="col-span-4">
            <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Tambah
            </button>
          </div>
        </form>
      </Card>

      <section className="space-y-3">
        {stages.length === 0 && <EmptyState message="Belum ada tahap pipeline. Tahap yang ditambahkan akan muncul di sini." />}
        {stages.map((stage) => (
          <div key={stage.id} className="bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4">
            <form action={updatePipelineStage} className="grid grid-cols-5 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Tahap</label>
                <input
                  name="stageKey"
                  defaultValue={stage.stageKey}
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Urutan</label>
                <input
                  name="stageOrder"
                  type="number"
                  min={1}
                  defaultValue={stage.stageOrder}
                  required
                  className="w-full border border-ink-muted/20 rounded-lg px-2 py-1.5 text-sm text-ink bg-surface"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isWonStage" value="true" defaultChecked={stage.isWonStage} className="h-4 w-4 accent-sage-deep" />
                <label className="text-sm text-ink-muted">Menang</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isLostStage" value="true" defaultChecked={stage.isLostStage} className="h-4 w-4 accent-sage-deep" />
                <label className="text-sm text-ink-muted">Hilang</label>
              </div>
              <button type="submit" className="bg-powder-blue-deep hover:bg-powder-blue-deep/90 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                Simpan
              </button>
            </form>
            <form action={removePipelineStage} className="mt-2">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <button type="submit" className="text-destructive hover:underline text-xs">
                Hapus Tahap
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
