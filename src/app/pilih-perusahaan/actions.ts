"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { companies } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { uploadCompanyLogo, CompanyLogoValidationError } from "@/lib/storage/companyLogo";
import { seedChartOfAccountsForCompany } from "@/lib/finance/chartOfAccounts";

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
    const company = await withTenantContext({ role: session.user.role, companyId: null }, async (tx) => {
      const [c] = await tx.insert(companies).values({ name, slug, code, businessType }).returning();
      // Chart of Accounts adalah data referensi dasar (Fase 3 spesifikasi Bagian 1,
      // template universal — sama untuk semua company terlepas jenis bisnis atau
      // status module_key='keuangan'), BUKAN sesuatu yang menunggu modul diaktifkan
      // dulu — sama seperti company tidak menunggu modul apa pun sebelum baris
      // company-nya sendiri ada. Reuse fungsi yang sama dipakai buat seed 4 company
      // existing (lib/finance/chartOfAccounts.ts), 1 transaksi dengan insert company
      // supaya atomik: kalau seeding gagal, pembuatan company ikut batal juga,
      // tidak pernah ada company tanpa COA.
      await seedChartOfAccountsForCompany(tx, c.id);
      return c;
    });
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
  const logoFile = formData.get("logoFile");

  if (!name || !businessType) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Nama dan jenis bisnis wajib diisi.")}`);
  }
  if (code && !CODE_PATTERN.test(code)) {
    redirect(`${REDIRECT_BASE}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }

  // Logo opsional per submit — kalau tidak ada file dipilih, jangan sentuh
  // logo_url yang sudah tersimpan (form ini juga dipakai buat edit nama/kode/dst
  // biasa, bukan cuma ganti logo).
  let logoUrl: string | undefined;
  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      logoUrl = await uploadCompanyLogo({ file: logoFile, companyId });
    } catch (err) {
      if (err instanceof CompanyLogoValidationError) {
        redirect(`${REDIRECT_BASE}?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: null }, (tx) =>
      tx
        .update(companies)
        .set({ name, code, businessType, isActive, ...(logoUrl ? { logoUrl } : {}), updatedAt: new Date() })
        .where(eq(companies.id, companyId))
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
    metadata: { name, code, businessType, isActive, logoUpdated: Boolean(logoUrl) },
  });

  revalidatePath(REDIRECT_BASE);
  redirect(`${REDIRECT_BASE}?success=1`);
}
