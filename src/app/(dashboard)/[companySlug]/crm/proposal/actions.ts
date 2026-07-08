"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { outgoingLetters, organizations, companies } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac/permissions";
import { logAudit } from "@/lib/audit/log";
import { createProposalItem, updateProposalItem, deleteProposalItem, ProposalItemError } from "@/lib/crm/proposalItems";

export async function createProposalAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const redirectBase = `/${companySlug}/crm/proposal`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin membuat proposal.")}`);
  }

  const organizationId = formData.get("organizationId")?.toString() ?? "";
  const departmentId = formData.get("departmentId")?.toString() ?? "";
  const subject = formData.get("subject")?.toString().trim() ?? "";

  if (!organizationId || !departmentId || !subject) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Organisasi, departemen, dan perihal wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  const [org] = await withTenantContext(tenantContext, (tx) =>
    tx.select().from(organizations).where(and(eq(organizations.id, organizationId), eq(organizations.companyId, company.id)))
  );
  if (!org) redirect(`${redirectBase}?error=${encodeURIComponent("Organisasi tidak ditemukan.")}`);

  let letterId: string;
  try {
    const [letter] = await withTenantContext(tenantContext, (tx) =>
      tx
        .insert(outgoingLetters)
        .values({
          companyId: company.id,
          departmentId,
          letterCategory: "surat_keluar",
          jenisKey: "penawaran",
          recipient: org.name,
          organizationId,
          subject,
          createdBy: session.user.id,
        })
        .returning()
    );
    letterId = letter.id;
  } catch {
    redirect(`${redirectBase}?error=${encodeURIComponent("Gagal menyimpan draft proposal.")}`);
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "create_proposal_draft",
    entityType: "outgoing_letter",
    entityId: letterId,
    metadata: { organizationId, subject },
  });

  revalidatePath(redirectBase);
  redirect(`/${companySlug}/surat-keluar/${letterId}?success=1`);
}

export async function createProposalItemAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const outgoingLetterId = formData.get("outgoingLetterId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar/${outgoingLetterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menambah item proposal.")}`);
  }

  const opportunityId = formData.get("opportunityId")?.toString() || null;
  const itemName = formData.get("itemName")?.toString().trim() ?? "";
  const quantity = formData.get("quantity")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const unitPrice = formData.get("unitPrice")?.toString().trim() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!itemName || !quantity || !unit || !unitPrice) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama item, kuantitas, satuan, dan harga satuan wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  await withTenantContext(tenantContext, (tx) =>
    createProposalItem(tx, { companyId: company.id, outgoingLetterId, opportunityId, itemName, quantity, unit, unitPrice, notes })
  );

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "create_proposal_item",
    entityType: "outgoing_letter",
    entityId: outgoingLetterId,
    metadata: { itemName, quantity, unitPrice, opportunityId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function updateProposalItemAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const outgoingLetterId = formData.get("outgoingLetterId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar/${outgoingLetterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin mengubah item proposal.")}`);
  }

  const itemName = formData.get("itemName")?.toString().trim() ?? "";
  const quantity = formData.get("quantity")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const unitPrice = formData.get("unitPrice")?.toString().trim() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!itemName || !quantity || !unit || !unitPrice) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Nama item, kuantitas, satuan, dan harga satuan wajib diisi.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  try {
    await withTenantContext(tenantContext, (tx) =>
      updateProposalItem(tx, { companyId: company.id, itemId, itemName, quantity, unit, unitPrice, notes })
    );
  } catch (err) {
    if (err instanceof ProposalItemError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "update_proposal_item",
    entityType: "outgoing_letter",
    entityId: outgoingLetterId,
    metadata: { itemId, itemName, quantity, unitPrice },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}

export async function deleteProposalItemAction(formData: FormData): Promise<void> {
  const companySlug = formData.get("companySlug")?.toString() ?? "";
  const outgoingLetterId = formData.get("outgoingLetterId")?.toString() ?? "";
  const itemId = formData.get("itemId")?.toString() ?? "";
  const redirectBase = `/${companySlug}/surat-keluar/${outgoingLetterId}`;

  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "CREATE_OUTGOING_LETTER")) {
    redirect(`${redirectBase}?error=${encodeURIComponent("Tidak punya izin menghapus item proposal.")}`);
  }

  const tenantContext = { role: session.user.role, companyId: session.user.companyId };
  const [company] = await withTenantContext(tenantContext, (tx) => tx.select().from(companies).where(eq(companies.slug, companySlug)));
  if (!company) redirect(`${redirectBase}?error=${encodeURIComponent("Perusahaan tidak ditemukan.")}`);

  try {
    await withTenantContext(tenantContext, (tx) =>
      deleteProposalItem(tx, { companyId: company.id, itemId })
    );
  } catch (err) {
    if (err instanceof ProposalItemError) {
      redirect(`${redirectBase}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await logAudit({
    companyId: company.id,
    userId: session.user.id,
    action: "delete_proposal_item",
    entityType: "outgoing_letter",
    entityId: outgoingLetterId,
    metadata: { itemId },
  });

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?success=1`);
}
