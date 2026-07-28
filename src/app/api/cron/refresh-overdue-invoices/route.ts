import { NextResponse } from "next/server";
import { withTenantContext } from "@/lib/db";
import { refreshOverdueInvoiceStatusesAllCompanies } from "@/lib/finance/ar";
import { logAudit, getRequestMeta } from "@/lib/audit/log";

// Endpoint cron untuk menyegarkan status jatuh_tempo invoice AR lintas company
// (docs/todo-fase4-keuangan-followups.md #3). Host-agnostic: bisa dipanggil oleh
// scheduler mana pun (Vercel Cron, Supabase pg_cron via pg_net, uptime cron
// eksternal) selama membawa header Authorization: Bearer <CRON_SECRET>.
//
// Wajib set env CRON_SECRET. Kalau belum diset, endpoint MENOLAK total (bukan
// terbuka) supaya tidak ada pemicuan anonim.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET belum dikonfigurasi di server." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withTenantContext({ role: "super_admin", companyId: null }, (tx) =>
    refreshOverdueInvoiceStatusesAllCompanies(tx)
  );

  // Satu-satunya mutasi terjadwal di sistem, dan lintas company — tanpa jejak,
  // perubahan status invoice jadi jatuh_tempo tidak bisa dipertanggungjawabkan.
  // companyId/userId null karena ini aksi sistem lintas-tenant (pola sama dengan
  // event login pra-autentikasi). entityId null: subjeknya banyak baris, bukan
  // satu; entityType tetap diisi supaya kelas subjeknya terbaca.
  // Sengaja dicatat walau 0 invoice berubah — bukti bahwa job-nya memang jalan.
  const { ipAddress, userAgent } = getRequestMeta(request);
  await logAudit({
    companyId: null,
    userId: null,
    action: "refresh_overdue_invoices",
    entityType: "ar_invoice",
    entityId: null,
    metadata: { trigger: "cron", ...result },
    ipAddress,
    userAgent,
  });

  return NextResponse.json({ ok: true, ...result });
}

// Vercel Cron memanggil dengan GET; sediakan juga POST untuk scheduler lain.
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
