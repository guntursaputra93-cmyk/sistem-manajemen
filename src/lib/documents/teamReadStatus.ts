import { and, eq, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { users, documentAccessLogs } from "@/drizzle/schema";

export type TeamReadStatusRow = {
  id: string;
  fullName: string;
  departmentId: string | null;
  hasRead: boolean;
};

/**
 * Status baca tim per dokumen (spesifikasi Bagian 3 RBAC + Langkah 15) —
 * department_head lihat timnya sendiri (departmentId diisi), company_admin/
 * super_admin lihat seluruh perusahaan (departmentId null). 1 query saja
 * (LEFT JOIN ke subquery ter-dedup) — bukan loop per staf, supaya tetap
 * murah dipanggil tiap kali dokumen dibuka.
 */
export async function getTeamReadStatus(
  tx: typeof Db,
  params: { documentVersionId: string; companyId: string; departmentId: string | null }
): Promise<TeamReadStatusRow[]> {
  const viewedSubquery = tx
    .selectDistinct({ userId: documentAccessLogs.userId })
    .from(documentAccessLogs)
    .where(and(eq(documentAccessLogs.documentVersionId, params.documentVersionId), eq(documentAccessLogs.action, "view")))
    .as("viewed");

  const rows = await tx
    .select({
      id: users.id,
      fullName: users.fullName,
      departmentId: users.departmentId,
      hasRead: sql<boolean>`${viewedSubquery.userId} IS NOT NULL`,
    })
    .from(users)
    .leftJoin(viewedSubquery, eq(viewedSubquery.userId, users.id))
    .where(
      params.departmentId
        ? and(eq(users.companyId, params.companyId), eq(users.departmentId, params.departmentId))
        : eq(users.companyId, params.companyId)
    )
    .orderBy(users.fullName);

  return rows;
}
