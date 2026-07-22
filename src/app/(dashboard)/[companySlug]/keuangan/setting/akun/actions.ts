"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { chartOfAccounts } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";
import { normalizeOpenItemType } from "@/lib/finance/openItems";

function flipBalance(balance: "debit" | "kredit"): "debit" | "kredit" {
  return balance === "debit" ? "kredit" : "debit";
}

export async function createChartOfAccount(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/setting/akun`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CHART_OF_ACCOUNTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur chart of accounts.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const parentId = formData.get("parentId")?.toString() ?? "";
  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const isContra = formData.get("isContra")?.toString() === "on";

  if (!parentId || !code || !name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun induk, kode, dan nama wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  try {
    await withTenantContext(tenantContext, async (tx) => {
      const [parent] = await tx
        .select()
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.id, parentId), eq(chartOfAccounts.companyId, companyId)));

      // Guard app-level (bukan cuma UI <select> yang sudah difilter is_header=true) —
      // sama alasannya dengan validasi is_header di journal_entry_lines Langkah 2:
      // request bisa dibuat manual di luar form.
      if (!parent || !parent.isHeader) {
        throw new Error("PARENT_NOT_HEADER");
      }

      // Level di-cap ke 3 (bukan parent.level+1 murni) — akun level-3 header (mis.
      // BANK, level 3) juga boleh punya anak yang levelnya tetap 3, bukan 4, sesuai
      // aturan "level = kedalaman di-cap ke 3" (lihat komentar schema/chartOfAccounts.ts).
      const level = Math.min(parent.level + 1, 3) as 1 | 2 | 3;
      const accountType = parent.accountType;
      const normalBalance = isContra ? flipBalance(parent.normalBalance) : parent.normalBalance;

      const [created] = await tx
        .insert(chartOfAccounts)
        .values({ companyId, code, name, level, parentId, accountType, normalBalance, isHeader: false })
        .returning();

      await logAudit({
        companyId,
        userId: session.user.id,
        action: "create_chart_of_account",
        entityType: "chart_of_account",
        entityId: created.id,
        metadata: { code, name, parentCode: parent.code, accountType, normalBalance },
      });
    });
  } catch (err) {
    const message = err instanceof Error && err.message === "PARENT_NOT_HEADER"
      ? "Akun induk harus akun header (grup), bukan akun posting."
      : "Kode akun ini sudah dipakai di perusahaan ini.";
    redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateChartOfAccount(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const accountId = formData.get("accountId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/setting/akun`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CHART_OF_ACCOUNTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur chart of accounts.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const isActive = formData.get("isActive")?.toString() === "true";
  // Setting "akun transaksi terbuka". Hanya berlaku untuk akun posting. Arah pemicunya
  // (debet/kredit) TIDAK disimpan terpisah — diturunkan dari jenisnya lewat
  // openItemTriggerSide(), supaya tidak mungkin ada kombinasi mustahil.
  const isOpenItem = formData.get("isOpenItem")?.toString() === "on";
  const rawType = formData.get("openItemType")?.toString();
  const openItemType = isOpenItem ? normalizeOpenItemType(rawType) : null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama akun wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(chartOfAccounts)
      .set({ name, isActive, isOpenItem, openItemType, updatedAt: new Date() })
      .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_chart_of_account",
    entityType: "chart_of_account",
    entityId: accountId,
    metadata: { name, isActive, isOpenItem, openItemType },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteChartOfAccount(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const accountId = formData.get("accountId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/keuangan/setting/akun`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_CHART_OF_ACCOUNTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur chart of accounts.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "keuangan" });

  // FK restrict menangani 2 kasus sekaligus lewat 1 try/catch (pola sama dengan
  // deleteDepartment/deleteDocumentCategory): (1) parent_id self-reference — akun
  // yang masih punya anak tidak bisa dihapus; (2) MULAI Langkah 2, journal_entry_lines
  // referensi chart_of_accounts dengan onDelete:"restrict" juga — akun yang sudah
  // dipakai jurnal otomatis ikut terlindungi tanpa kode baru.
  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.delete(chartOfAccounts).where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Akun ini masih dipakai (punya akun turunan dan/atau sudah dipakai transaksi) — tidak bisa dihapus, nonaktifkan saja.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_chart_of_account",
    entityType: "chart_of_account",
    entityId: accountId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
