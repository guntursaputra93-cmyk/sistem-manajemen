"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
const REDIRECT_BASE = "/pilih-perusahaan";

function normalizeCode(raw: FormDataEntryValue | null): string | null {
  const value = (raw?.toString() ?? "").trim().toUpperCase();
  return value ? value : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCompany(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_COMPANIES")) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Tidak punya izin membuat perusahaan.")}`);
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const code = normalizeCode(formData.get("code"));
  const businessType = formData.get("businessType")?.toString().trim() ?? "";

  if (!name || !businessType) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Nama dan jenis bisnis wajib diisi.")}`);
  }
  if (code && !CODE_PATTERN.test(code)) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }

  const slug = slugify(name);
  if (!slug) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Nama perusahaan tidak valid untuk dibuat jadi URL.")}`);
  }

  let newCompanyId: string;
  try {
    const [company] = await withTenantContext({ role: session.user.role, companyId: null }, (tx) =>
      tx.insert(companies).values({ name, slug, code, businessType }).returning()
    );
    newCompanyId = company.id;
  } catch {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Nama/kode ini menghasilkan slug atau kode yang sudah dipakai — coba nama sedikit berbeda.")}`);
  }

  await logAudit({
    companyId: newCompanyId,
    userId: session.user.id,
    action: "create_company",
    entityType: "company",
    entityId: newCompanyId,
    metadata: { name, slug, code, businessType },
  });

  revalidatePath(REDIRECT_BASE);
  redirect(`${REDIRECT_BASE}?success=1`);
}

export async function updateCompany(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_COMPANIES")) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Tidak punya izin mengubah perusahaan.")}`);
  }

  const companyId = formData.get("companyId")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const code = normalizeCode(formData.get("code"));
  const businessType = formData.get("businessType")?.toString().trim() ?? "";
  const isActive = formData.get("isActive")?.toString() === "true";

  if (!name || !businessType) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Nama dan jenis bisnis wajib diisi.")}`);
  }
  if (code && !CODE_PATTERN.test(code)) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: null }, (tx) =>
      tx.update(companies).set({ name, code, businessType, isActive, updatedAt: new Date() }).where(eq(companies.id, companyId))
    );
  } catch {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Kode ini sudah dipakai perusahaan lain.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_company",
    entityType: "company",
    entityId: companyId,
    metadata: { name, code, businessType, isActive },
  });

  revalidatePath(REDIRECT_BASE);
  redirect(`${REDIRECT_BASE}?success=1`);
}
