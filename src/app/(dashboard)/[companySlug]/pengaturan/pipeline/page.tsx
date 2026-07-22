import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabled } from "@/lib/modules";
import { getPipelineStages } from "@/lib/crm/pipeline";
import { addPipelineStage, updatePipelineStage, removePipelineStage } from "./actions";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormDrawer, DrawerFooter } from "@/components/ui/FormDrawer";
import { FormSection, FormField, inputClass } from "@/components/ui/FormField";

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
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[{ label: "Pengaturan" }, { label: "Tahap Pipeline" }]}
        title="Tahap Pipeline (CRM)"
        description={`Atur tahap pipeline penjualan untuk ${company.name}. Bebas dikonfigurasi, urutan menentukan tampilan.`}
        actions={
          <FormDrawer buttonLabel="Tambah Tahap" title="Tambah Tahap Pipeline" defaultOpen={Boolean(error)}>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-ink">
                {error}
              </div>
            )}
            <form action={addPipelineStage}>
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <FormSection title="Detail Tahap">
                <FormField label="Nama Tahap (stage_key) *">
                  <input autoComplete="off" name="stageKey" required placeholder="mis. lead_baru" className={inputClass} />
                </FormField>
                <FormField label="Urutan *">
                  <input autoComplete="off" name="stageOrder" type="number" min={1} defaultValue={stages.length + 1} required className={inputClass} />
                </FormField>
                <FormField label="Penanda Tahap" full>
                  <div className="flex flex-col gap-2 py-1">
                    <label className="flex items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" name="isWonStage" value="true" className="h-4 w-4 accent-peach-deep" />
                      Tahap Menang
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" name="isLostStage" value="true" className="h-4 w-4 accent-peach-deep" />
                      Tahap Hilang
                    </label>
                  </div>
                </FormField>
              </FormSection>
              <DrawerFooter submitLabel="Tambah Tahap" />
            </form>
          </FormDrawer>
        }
      />

      {success && <div className="bg-sage/20 border border-sage-deep/20 text-ink text-[13px] rounded-lg px-4 py-3">Berhasil disimpan.</div>}
      {(!hasWonStage || !hasLostStage) && (
        <div className="bg-dusty-rose/20 border border-dusty-rose-deep/20 text-ink text-sm rounded-lg px-4 py-3">
          {!hasWonStage && <p>Belum ada tahap &quot;menang&quot; — tandai minimal 1 tahap sebagai tahap menang.</p>}
          {!hasLostStage && <p>Belum ada tahap &quot;hilang&quot; — tandai minimal 1 tahap sebagai tahap hilang.</p>}
        </div>
      )}

      <section className="space-y-2">
        {stages.length === 0 && <EmptyState message="Belum ada tahap pipeline. Tahap yang ditambahkan akan muncul di sini." />}
        {stages.map((stage) => (
          <div key={stage.id} className="max-w-3xl bg-surface rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-3">
            <form action={updatePipelineStage} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <input type="hidden" name="companySlug" value={companySlug} />
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Nama Tahap</label>
                <input autoComplete="off"
                  name="stageKey"
                  defaultValue={stage.stageKey}
                  required
                  className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-ink-muted mb-1">Urutan</label>
                <input autoComplete="off"
                  name="stageOrder"
                  type="number"
                  min={1}
                  defaultValue={stage.stageOrder}
                  required
                  className="w-full border border-ink-muted/12 rounded-lg px-2 py-[6px] text-[11px] text-ink bg-bg-base"
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isWonStage" value="true" defaultChecked={stage.isWonStage} className="h-3.5 w-3.5 accent-sage-deep" />
                <label className="text-[11px] text-ink-muted">Menang</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isLostStage" value="true" defaultChecked={stage.isLostStage} className="h-3.5 w-3.5 accent-sage-deep" />
                <label className="text-[11px] text-ink-muted">Hilang</label>
              </div>
              <button type="submit" className="bg-sage-deep hover:bg-sage-deep/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                Edit
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
