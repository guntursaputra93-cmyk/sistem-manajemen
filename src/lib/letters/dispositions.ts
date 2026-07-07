import { and, desc, eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { incomingLetters, letterDispositions, users } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";

export class DispositionError extends Error {}

export type CreateDispositionParams = {
  companyId: string;
  incomingLetterId: string;
  fromUserId: string;
  fromUserRole: Role;
  fromUserDepartmentId: string | null;
  targetDepartmentId?: string | null;
  targetUserId?: string | null;
  instruction?: string | null;
};

/**
 * department_head cuma boleh disposisi "ke bawahan" (lihat spesifikasi Bagian 3)
 * — dibatasi ke departemen sendiri, tidak bisa lempar ke departemen lain.
 * company_admin/super_admin tidak dibatasi (disposisi lintas departemen).
 */
export async function createDisposition(tx: typeof Db, params: CreateDispositionParams): Promise<void> {
  if (!params.targetDepartmentId && !params.targetUserId) {
    throw new DispositionError("Tujuan disposisi wajib diisi (departemen atau orang).");
  }

  if (params.fromUserRole === "department_head") {
    if (params.targetDepartmentId && params.targetDepartmentId !== params.fromUserDepartmentId) {
      throw new DispositionError("Kepala departemen hanya bisa disposisi ke departemen sendiri.");
    }
    if (params.targetUserId) {
      const [targetUser] = await tx.select().from(users).where(eq(users.id, params.targetUserId));
      if (!targetUser || targetUser.departmentId !== params.fromUserDepartmentId) {
        throw new DispositionError("Kepala departemen hanya bisa disposisi ke bawahan di departemen sendiri.");
      }
    }
  }

  const [lastStep] = await tx
    .select()
    .from(letterDispositions)
    .where(eq(letterDispositions.incomingLetterId, params.incomingLetterId))
    .orderBy(desc(letterDispositions.stepOrder))
    .limit(1);
  const nextStepOrder = (lastStep?.stepOrder ?? 0) + 1;

  await tx.insert(letterDispositions).values({
    companyId: params.companyId,
    incomingLetterId: params.incomingLetterId,
    fromUserId: params.fromUserId,
    targetDepartmentId: params.targetDepartmentId ?? null,
    targetUserId: params.targetUserId ?? null,
    instruction: params.instruction ?? null,
    stepOrder: nextStepOrder,
  });

  // Hanya naikkan status dari 'baru' -> tidak menimpa 'selesai'/'diarsipkan' yang sudah final.
  await tx
    .update(incomingLetters)
    .set({ status: "didisposisikan", updatedAt: new Date() })
    .where(and(eq(incomingLetters.id, params.incomingLetterId), eq(incomingLetters.status, "baru")));
}
