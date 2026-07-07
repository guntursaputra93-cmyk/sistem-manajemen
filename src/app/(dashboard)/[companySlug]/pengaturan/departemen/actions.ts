"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { departments } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";

const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

function normalizeCode(raw: FormDataEntryValue | null): string | null {
  const value = (raw?.toString() ?? "").trim().toUpperCase();
  return value ? value : null;
}

export async function createDepartment(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/departemen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur departemen.")}`);
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const code = normalizeCode(formData.get("code"));
  const parentDepartmentId = formData.get("parentDepartmentId")?.toString() || null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama departemen wajib diisi.")}`);
  }
  if (code && !CODE_PATTERN.test(code)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(departments).values({ companyId, name, code, parentDepartmentId })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode departemen ini sudah dipakai.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_department",
    entityType: "department",
    metadata: { name, code, parentDepartmentId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateDepartment(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/departemen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur departemen.")}`);
  }

  const name = formData.get("name")?.toString().trim() ?? "";
  const code = normalizeCode(formData.get("code"));
  const parentDepartmentId = formData.get("parentDepartmentId")?.toString() || null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama departemen wajib diisi.")}`);
  }
  if (code && !CODE_PATTERN.test(code)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode harus 2-10 huruf/angka kapital.")}`);
  }
  if (parentDepartmentId === departmentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Departemen tidak bisa jadi induk untuk dirinya sendiri.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx
        .update(departments)
        .set({ name, code, parentDepartmentId, updatedAt: new Date() })
        .where(and(eq(departments.id, departmentId), eq(departments.companyId, companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Kode departemen ini sudah dipakai.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_department",
    entityType: "department",
    entityId: departmentId,
    metadata: { name, code, parentDepartmentId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteDepartment(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/departemen`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_DEPARTMENTS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur departemen.")}`);
  }

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.delete(departments).where(and(eq(departments.id, departmentId), eq(departments.companyId, companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Departemen ini masih dipakai (mis. penentu nomor surat) — tidak bisa dihapus.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "delete_department",
    entityType: "department",
    entityId: departmentId,
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
