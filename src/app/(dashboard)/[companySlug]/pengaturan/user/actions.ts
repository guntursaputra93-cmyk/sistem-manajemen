"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { users, employees } from "@/drizzle/schema";
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
  const linkEmployeeId = formData.get("linkEmployeeId")?.toString() || null;
  const redirectBase = `/${companySlug}/pengaturan/user`;

  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const role = formData.get("role")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() || null;

  // Redirect error tetap membawa balik prefill + linkEmployeeId — supaya alur
  // "Berikan Akses Sistem" dari halaman karyawan tidak kehilangan konteks kalau
  // validasi gagal (mis. email sudah dipakai), bukan cuma dilempar ke form kosong.
  function errorRedirect(message: string): never {
    const params = new URLSearchParams({ error: message });
    if (fullName) params.set("prefillFullName", fullName);
    if (email) params.set("prefillEmail", email);
    if (linkEmployeeId) params.set("linkEmployeeId", linkEmployeeId);
    redirect(`${redirectBase}?${params.toString()}`);
  }

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_USERS")) {
    errorRedirect("Tidak punya izin mengatur user.");
  }

  if (!fullName || !email || !password) {
    errorRedirect("Nama, email, dan password wajib diisi.");
  }
  if (password.length < 8) {
    errorRedirect("Password minimal 8 karakter.");
  }
  if (!ROLE_VALUES.includes(role as Role)) {
    errorRedirect("Role tidak valid.");
  }
  if (departmentRequiredForRole(role as Role) && !departmentId) {
    errorRedirect("Role ini wajib terhubung ke 1 departemen.");
  }

  const passwordHash = await hashPassword(password);
  const effectiveDepartmentId = departmentRequiredForRole(role as Role) ? departmentId : null;

  let newUserId: string;
  try {
    const [newUser] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx.insert(users).values({
        companyId,
        email,
        passwordHash,
        fullName,
        departmentId: effectiveDepartmentId,
        role: role as Role,
      }).returning()
    );
    newUserId = newUser.id;
  } catch {
    errorRedirect("Email ini sudah dipakai user lain.");
  }

  // Linking employees.user_id best-effort: kalau baris karyawan sudah keburu
  // ditautkan oleh proses lain (race condition) atau linkEmployeeId tidak valid,
  // WHERE ini tidak match apapun (0 baris ter-update) — akun user yang baru dibuat
  // TETAP dianggap berhasil, tidak di-rollback hanya karena linking gagal.
  if (linkEmployeeId) {
    await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
      tx
        .update(employees)
        .set({ userId: newUserId, updatedAt: new Date() })
        .where(and(eq(employees.id, linkEmployeeId), eq(employees.companyId, companyId), isNull(employees.userId)))
    );
  }

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_user",
    entityType: "user",
    entityId: newUserId,
    metadata: { email, role, departmentId: effectiveDepartmentId, linkedEmployeeId: linkEmployeeId ?? undefined },
  });

  revalidatePath(redirectBase);
  if (linkEmployeeId) {
    revalidatePath(`/${companySlug}/sdm/karyawan/${linkEmployeeId}`);
    redirect(`/${companySlug}/sdm/karyawan/${linkEmployeeId}?success=1`);
  }
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
