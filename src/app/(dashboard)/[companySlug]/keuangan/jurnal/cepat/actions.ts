"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { createQuickJournalFromTemplate, TemplateError } from "@/lib/finance/journalTemplates";
import { JournalError } from "@/lib/finance/journal";

export async function createQuickJournal(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const templateId = formData.get("templateId")?.toString() ?? "";
  const backBase = `/${companySlug}/keuangan/jurnal/cepat?template=${templateId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_JOURNAL_ENTRIES")) {
    redirect(`${backBase}&error=${encodeURIComponent("Tidak punya izin membuat jurnal.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const entryDate = formData.get("entryDate")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!entryDate || !description) {
    redirect(`${backBase}&error=${encodeURIComponent("Tanggal dan keterangan wajib diisi.")}`);
  }

  // Baris disubmit sebagai dua array paralel (lineId[] & amount[]) dalam urutan DOM
  // yang sama — FormData.getAll mempertahankan urutan, jadi indeks ke-i keduanya
  // pasti pasangan yang benar.
  const lineIds = formData.getAll("lineId").map((v) => v.toString());
  const amounts = formData.getAll("amount").map((v) => v.toString());
  const oiDescs = formData.getAll("lineOpenItemDesc").map((v) => v.toString());
  const oiDues = formData.getAll("lineOpenItemDue").map((v) => v.toString());
  const lineOrgs = formData.getAll("lineOrg").map((v) => v.toString());
  const amountByLineId = new Map<string, number>();
  const openItemByLineId = new Map<string, { description: string; dueDate: string | null }>();
  const organizationByLineId = new Map<string, string | null>();
  for (let i = 0; i < lineIds.length; i++) {
    const raw = (amounts[i] ?? "").trim().replace(/\./g, "").replace(",", ".");
    const n = raw ? Number(raw) : 0;
    amountByLineId.set(lineIds[i], Number.isFinite(n) ? n : 0);
    // Rekanan berlaku untuk baris jurnalnya sendiri (dimensi penelusuran) sekaligus
    // jadi rekanan transaksi terbuka yang dibuka baris itu.
    organizationByLineId.set(lineIds[i], (lineOrgs[i] ?? "").trim() || null);
    const d = (oiDescs[i] ?? "").trim();
    if (d) openItemByLineId.set(lineIds[i], { description: d, dueDate: (oiDues[i] ?? "").trim() || null });
  }

  let result: { journalEntryId: string; entryNumber: string };
  try {
    result = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      createQuickJournalFromTemplate(tx, {
        companyId,
        templateId,
        entryDate,
        description,
        amountByLineId,
        openItemByLineId,
        organizationByLineId,
        userId: session.user.id,
      })
    );
  } catch (err) {
    if (err instanceof TemplateError || err instanceof JournalError) {
      redirect(`${backBase}&error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_quick_journal",
    entityType: "journal_entry",
    entityId: result.journalEntryId,
    metadata: { templateId, entryNumber: result.entryNumber },
  });

  revalidatePath(`/${companySlug}/keuangan/jurnal`);
  redirect(`/${companySlug}/keuangan/jurnal/${result.journalEntryId}?success=1`);
}
