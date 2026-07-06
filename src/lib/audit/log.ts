import { dbAdmin } from "@/lib/db";
import { auditTrails } from "@/drizzle/schema";

export type AuditLogEntry = {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

// Semua penulisan audit trail lewat dbAdmin (bypass RLS). Ini konsisten: event
// seperti login/login_failed terjadi SEBELUM ada session/company context, jadi
// tidak ada cara buat app_user (yang RLS-nya butuh company_id cocok) menulis
// baris ber-company_id null di titik itu. Daripada punya 2 jalur penulisan
// audit yang berbeda (satu pra-auth, satu pasca-auth), disederhanakan jadi 1
// jalur admin saja — audit trail memang cross-cutting concern, bukan data
// bisnis per-tenant biasa.
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  await dbAdmin.insert(auditTrails).values({
    companyId: entry.companyId ?? null,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

export function getRequestMeta(request: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const userAgent = request.headers.get("user-agent");
  return { ipAddress, userAgent };
}
