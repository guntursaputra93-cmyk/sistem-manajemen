import { and, asc, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { approvalFlows, approvalSteps } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";

export type ApprovalEntityType = "surat_keluar" | "nota_dinas" | "dokumen";

export type ActingUser = {
  id: string;
  role: Role;
  departmentId: string | null;
};

export class ApprovalError extends Error {}

/**
 * Buat baris approval_steps untuk 1 entity berdasarkan konfigurasi approval_flows
 * yang berlaku (company + applies_to + jenis_key). Kalau admin belum konfigurasi
 * jenis ini sama sekali, tidak ada step yang dibuat — entity otomatis dianggap
 * "lolos approval" (0 syarat), konsisten dengan pola default-permisif di modul
 * lain (mis. document_access_rules) daripada diam-diam memblokir tanpa config.
 */
export async function initializeApprovalSteps(
  tx: typeof Db,
  params: {
    companyId: string;
    entityType: ApprovalEntityType;
    entityId: string;
    jenisKey: string;
    departmentId?: string | null;
  }
): Promise<void> {
  const flowSteps = await tx
    .select()
    .from(approvalFlows)
    .where(
      and(
        eq(approvalFlows.companyId, params.companyId),
        eq(approvalFlows.appliesTo, params.entityType),
        eq(approvalFlows.jenisKey, params.jenisKey)
      )
    )
    .orderBy(asc(approvalFlows.stepOrder));

  if (flowSteps.length === 0) return;

  await tx.insert(approvalSteps).values(
    flowSteps.map((flow) => ({
      companyId: params.companyId,
      entityType: params.entityType,
      entityId: params.entityId,
      jenisKey: params.jenisKey,
      departmentId: params.departmentId ?? null,
      stepOrder: flow.stepOrder,
      status: "pending" as const,
    }))
  );
}

function isEligibleApprover(
  flow: { requiredRole: string | null; requiredApproverUserId: string | null },
  step: { departmentId: string | null },
  user: ActingUser
): boolean {
  if (user.role === "super_admin") return true; // lintas company & lintas jenjang, konsisten dgn RBAC section 3
  if (flow.requiredApproverUserId) return user.id === flow.requiredApproverUserId;
  if (flow.requiredRole === "department_head") {
    return user.role === "department_head" && user.departmentId !== null && user.departmentId === step.departmentId;
  }
  return user.role === flow.requiredRole;
}

/**
 * Catat keputusan approve/reject untuk 1 jenjang. Approval WAJIB berurutan —
 * jenjang ke-N tidak bisa diproses sebelum jenjang 1..N-1 semuanya 'approved'.
 */
export async function recordApprovalDecision(
  tx: typeof Db,
  params: {
    companyId: string;
    entityType: ApprovalEntityType;
    entityId: string;
    stepOrder: number;
    actingUser: ActingUser;
    decision: "approved" | "rejected";
    catatan?: string | null;
  }
): Promise<void> {
  const allSteps = await tx
    .select()
    .from(approvalSteps)
    .where(and(eq(approvalSteps.entityType, params.entityType), eq(approvalSteps.entityId, params.entityId)))
    .orderBy(asc(approvalSteps.stepOrder));

  const step = allSteps.find((s) => s.stepOrder === params.stepOrder);
  if (!step) throw new ApprovalError("Jenjang approval tidak ditemukan.");
  if (step.status !== "pending") throw new ApprovalError("Jenjang ini sudah diproses sebelumnya.");

  const firstPending = allSteps.find((s) => s.status === "pending");
  if (!firstPending || firstPending.stepOrder !== params.stepOrder) {
    throw new ApprovalError("Jenjang sebelumnya belum di-approve — tidak bisa melompat urutan.");
  }

  const [flow] = await tx
    .select()
    .from(approvalFlows)
    .where(
      and(
        eq(approvalFlows.companyId, params.companyId),
        eq(approvalFlows.appliesTo, params.entityType),
        eq(approvalFlows.jenisKey, step.jenisKey),
        eq(approvalFlows.stepOrder, params.stepOrder)
      )
    );
  if (!flow) throw new ApprovalError("Konfigurasi approval untuk jenjang ini tidak ditemukan.");

  if (!isEligibleApprover(flow, step, params.actingUser)) {
    throw new ApprovalError("Kamu tidak berwenang memproses jenjang approval ini.");
  }

  await tx
    .update(approvalSteps)
    .set({
      status: params.decision,
      approverId: params.actingUser.id,
      approvedAt: new Date(),
      catatan: params.catatan ?? null,
    })
    .where(eq(approvalSteps.id, step.id));
}

export type ApprovalStatus = {
  totalSteps: number;
  allApproved: boolean;
  anyRejected: boolean;
};

/** Dipakai entity (mis. outgoing_letters) untuk cek apakah sudah boleh generate nomor resmi. */
export async function getApprovalStatus(
  tx: typeof Db,
  params: { entityType: ApprovalEntityType; entityId: string }
): Promise<ApprovalStatus> {
  const steps = await tx
    .select()
    .from(approvalSteps)
    .where(and(eq(approvalSteps.entityType, params.entityType), eq(approvalSteps.entityId, params.entityId)));

  return {
    totalSteps: steps.length,
    allApproved: steps.every((s) => s.status === "approved"),
    anyRejected: steps.some((s) => s.status === "rejected"),
  };
}
