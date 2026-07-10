import { and, eq, inArray } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { leaveRequests } from "@/drizzle/schema";
import type { Role } from "@/lib/rbac/permissions";
import { resolveViewer, getVisibleEmployeeIds } from "@/lib/hr/employees";
import { getExpiringCompetencies } from "@/lib/hr/competencies";
import { getUnreadDocumentCount } from "@/lib/documents/access";

export type NotificationItem = { label: string; count: number; href: string };
export type NotificationSummary = { total: number; items: NotificationItem[] };

/**
 * Gabungan 1 angka notifikasi lonceng top bar dari 3 sumber yang sudah ada:
 * kompetensi mendekati expired, cuti menunggu approval, dokumen belum dibaca.
 * Tiap sumber di-gate oleh flag (module aktif + permission) yang sudah dihitung
 * layout.tsx — kalau semuanya false, tidak ada query sama sekali.
 */
export async function getNotificationSummary(
  tx: typeof Db,
  params: {
    companyId: string;
    userId: string;
    role: Role;
    companySlug: string;
    flags: { competency: boolean; leaveApproval: boolean; documents: boolean };
  }
): Promise<NotificationSummary> {
  const { flags } = params;
  if (!flags.competency && !flags.leaveApproval && !flags.documents) {
    return { total: 0, items: [] };
  }

  const viewer = await resolveViewer(tx, { userId: params.userId, role: params.role });
  const visibleEmployeeIds =
    flags.competency || flags.leaveApproval
      ? await getVisibleEmployeeIds(tx, { companyId: params.companyId, viewer })
      : null;

  const [competencyCount, leaveCount, documentCount] = await Promise.all([
    flags.competency
      ? getExpiringCompetencies(tx, { companyId: params.companyId, withinMonths: 3 }).then((rows) =>
          visibleEmployeeIds ? rows.filter((r) => visibleEmployeeIds.includes(r.employeeId)).length : rows.length
        )
      : Promise.resolve(0),
    flags.leaveApproval
      ? tx
          .select()
          .from(leaveRequests)
          .where(
            visibleEmployeeIds
              ? and(eq(leaveRequests.companyId, params.companyId), eq(leaveRequests.status, "pending"), inArray(leaveRequests.employeeId, visibleEmployeeIds))
              : and(eq(leaveRequests.companyId, params.companyId), eq(leaveRequests.status, "pending"))
          )
          .then((rows) => rows.length)
      : Promise.resolve(0),
    flags.documents
      ? Promise.all([
          getUnreadDocumentCount(tx, { companyId: params.companyId, hierarchyLevel: 1, userId: params.userId, viewer }),
          getUnreadDocumentCount(tx, { companyId: params.companyId, hierarchyLevel: 2, userId: params.userId, viewer }),
        ]).then(([a, b]) => a + b)
      : Promise.resolve(0),
  ]);

  const items: NotificationItem[] = [
    { label: "Kompetensi akan kedaluwarsa", count: competencyCount, href: `/${params.companySlug}/sdm/kompetensi` },
    { label: "Cuti menunggu persetujuan", count: leaveCount, href: `/${params.companySlug}/sdm/cuti` },
    { label: "Dokumen belum dibaca", count: documentCount, href: `/${params.companySlug}/arsip` },
  ].filter((item) => item.count > 0);

  return { total: competencyCount + leaveCount + documentCount, items };
}
