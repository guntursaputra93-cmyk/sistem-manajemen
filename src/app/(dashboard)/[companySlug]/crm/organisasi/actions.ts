"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { organizations, organizationContacts, activities } from "@/drizzle/schema";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireModuleEnabledForAction } from "@/lib/modules";
import { logAudit } from "@/lib/audit/log";

export async function createOrganization(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/organisasi`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_ORGANIZATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat organisasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const name = formData.get("name")?.toString().trim() ?? "";
  // Peran rekanan: klien (CRM), pemasok (vendor untuk uang muka/hutang), atau keduanya.
  const rawType = formData.get("partnerType")?.toString();
  const partnerType = rawType === "pemasok" || rawType === "keduanya" ? rawType : "klien";
  const industry = formData.get("industry")?.toString().trim() || null;
  const companySize = formData.get("companySize")?.toString().trim() || null;
  const source = formData.get("source")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama organisasi wajib diisi.")}`);
  }

  const [org] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(organizations).values({ companyId, name, partnerType, industry, companySize, source, notes }).returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_organization",
    entityType: "organization",
    entityId: org.id,
    metadata: { name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}/${org.id}?success=1`);
}

export async function updateOrganization(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/organisasi/${organizationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_ORGANIZATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah organisasi.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const name = formData.get("name")?.toString().trim() ?? "";
  // Peran rekanan: klien (CRM), pemasok (vendor untuk uang muka/hutang), atau keduanya.
  const rawType = formData.get("partnerType")?.toString();
  const partnerType = rawType === "pemasok" || rawType === "keduanya" ? rawType : "klien";
  const industry = formData.get("industry")?.toString().trim() || null;
  const companySize = formData.get("companySize")?.toString().trim() || null;
  const source = formData.get("source")?.toString().trim() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama organisasi wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .update(organizations)
      .set({ name, partnerType, industry, companySize, source, notes, updatedAt: new Date() })
      .where(and(eq(organizations.id, organizationId), eq(organizations.companyId, companyId)))
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "update_organization",
    entityType: "organization",
    entityId: organizationId,
    metadata: { name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createContact(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/organisasi/${organizationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "MANAGE_ORGANIZATIONS")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah kontak.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const name = formData.get("name")?.toString().trim() ?? "";
  const position = formData.get("position")?.toString().trim() || null;
  const email = formData.get("email")?.toString().trim() || null;
  const phone = formData.get("phone")?.toString().trim() || null;
  const isPrimary = formData.get("isPrimary")?.toString() === "true";

  if (!name) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama kontak wajib diisi.")}`);
  }

  await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx.insert(organizationContacts).values({ companyId, organizationId, name, position, email, phone, isPrimary })
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_organization_contact",
    entityType: "organization_contact",
    metadata: { organizationId, name },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function createActivity(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const companyId = formData.get("companyId")?.toString() ?? "";
  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/organisasi/${organizationId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_ACTIVITY")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mencatat aktivitas.")}`);
  }

  await requireModuleEnabledForAction({ role: session.user.role, companyId: session.user.companyId, companySlug, moduleKey: "crm" });

  const activityType = formData.get("activityType")?.toString() ?? "";
  const opportunityId = formData.get("opportunityId")?.toString() || null;
  const notes = formData.get("notes")?.toString().trim() || null;
  const activityDate = formData.get("activityDate")?.toString() || "";
  const nextFollowupDate = formData.get("nextFollowupDate")?.toString() || null;

  const ACTIVITY_TYPES = ["telepon", "meeting", "email", "lainnya"] as const;
  if (!ACTIVITY_TYPES.includes(activityType as (typeof ACTIVITY_TYPES)[number]) || !activityDate) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Jenis aktivitas dan tanggal wajib diisi.")}`);
  }

  const [activity] = await withTenantContext({ role: session.user.role, companyId: session.user.companyId }, (tx) =>
    tx
      .insert(activities)
      .values({
        companyId,
        organizationId,
        opportunityId,
        activityType: activityType as (typeof ACTIVITY_TYPES)[number],
        notes,
        activityDate,
        nextFollowupDate,
        createdBy: session.user.id,
      })
      .returning()
  );

  await logAudit({
    companyId,
    userId: session.user.id,
    action: "create_activity",
    entityType: "activity",
    entityId: activity.id,
    metadata: { organizationId, activityType, opportunityId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
