"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { hasPermission, type Role } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { hashPassword } from "@/lib/auth/password";

const ROLE_VALUES: readonly Role[] = ["super_admin", "company_admin", "department_head", "staff"];

// department_head & staff wajib terhubung 1 departemen (spesifikasi Langkah 13) —
// company_admin/super_admin tidak terikat 1 departemen tertentu.
function departmentRequiredForRole(role: Role): boolean {
  return role === "department_head" || role === "staff";
}

export async function createUser(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/user`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_USERS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur user.")}`);
  }

  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const role = formData.get("role")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;

  if (!fullName || !email || !password) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama, email, dan password wajib diisi.")}`);
  }
  if (password.length < 8) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Password minimal 8 karakter.")}`);
  }
  if (!ROLE_VALUES.includes(role as Role)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Role tidak valid.")}`);
  }
  if (departmentRequiredForRole(role as Role) && !departmentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Role ini wajib terhubung ke 1 departemen.")}`);
  }

  const passwordHash = await hashPassword(password);
  const effectiveDepartmentId = departmentRequiredForRole(role as Role) ? departmentId : null;

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(users).values({
        companyId,
        email,
        passwordHash,
        fullName,
        departmentId: effectiveDepartmentId,
        role: role as Role,
      })
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Email ini sudah dipakai user lain.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_user",
    entityType: "user",
    metadata: { email, role, departmentId: effectiveDepartmentId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateUser(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const userId = formData.get("userId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/pengaturan/user/${userId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_USERS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengatur user.")}`);
  }

  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const role = formData.get("role")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;
  const isActive = formData.get("isActive")?.toString() === "true";
  const newPassword = formData.get("newPassword")?.toString() ?? "";

  if (!fullName || !email) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama dan email wajib diisi.")}`);
  }
  if (!ROLE_VALUES.includes(role as Role)) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Role tidak valid.")}`);
  }
  if (departmentRequiredForRole(role as Role) && !departmentId) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Role ini wajib terhubung ke 1 departemen.")}`);
  }
  if (newPassword && newPassword.length < 8) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Password baru minimal 8 karakter.")}`);
  }

  const effectiveDepartmentId = departmentRequiredForRole(role as Role) ? departmentId : null;
  const passwordHash = newPassword ? await hashPassword(newPassword) : undefined;

  try {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx
        .update(users)
        .set({
          fullName,
          email,
          role: role as Role,
          departmentId: effectiveDepartmentId,
          isActive,
          updatedAt: new Date(),
          ...(passwordHash ? { passwordHash } : {}),
        })
        .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    );
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Email ini sudah dipakai user lain.")}`);
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_user",
    entityType: "user",
    entityId: userId,
    metadata: { email, role, departmentId: effectiveDepartmentId, isActive, passwordChanged: Boolean(passwordHash) },
  });

  revalidatePath(`/${companySlug}/pengaturan/user`);
  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
