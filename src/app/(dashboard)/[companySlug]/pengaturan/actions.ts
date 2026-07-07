"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

// Huruf besar + angka saja supaya konsisten dipakai di format nomor surat/nota dinas.
const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

function normalizeCode(raw: FormDataEntryValue | null): string {
  return (raw?.toString() ?? "").trim().toUpperCase();
}

export async function updateCompanyCode(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_COMPANIES")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah kode perusahaan.")}`);
  }

  const code = normalizeCode(formData.get("code"));
  if (!CODE_PATTERN.test(code)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }

  try {
    await withTenantContext(
      { role: session.user.role, companyId: session.user.companyId },
      (tx) => tx.update(companies).set({ code, updatedAt: new Date() }).where(eq(companies.id, companyId))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode sudah dipakai perusahaan lain.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_company_code",
    entityType: "company",
    entityId: companyId,
    metadata: { code },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
