import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { attachments } from "@/drizzle/schema";
import { createSignedDownloadUrl } from "@/lib/storage/attachments";
import { logDocumentAccess } from "@/lib/documents/access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantContext = { role: session.user.role, companyId: session.user.companyId };

  // RLS (app.current_company_id) yang menentukan attachment ini kelihatan atau
  // tidak untuk user ini — kalau bukan company-nya, query ini pulang kosong.
  const [attachment] = await withTenantContext(tenantContext, (tx) => tx.select().from(attachments).where(eq(attachments.id, id)));

  if (!attachment) {
    return NextResponse.json({ error: "Lampiran tidak ditemukan." }, { status: 404 });
  }

  // entityId lampiran 'dokumen' adalah document_version.id (lihat POST /api/attachments)
  // — dicatat ke document_access_logs, terpisah dari audit_trails (Bagian 2.4).
  if (attachment.entityType === "dokumen") {
    await withTenantContext(tenantContext, (tx) =>
      logDocumentAccess(tx, { companyId: attachment.companyId, documentVersionId: attachment.entityId, userId: session.user.id, action: "download" })
    );
  }

  const expiresInSeconds = 600;
  const signedUrl = await createSignedDownloadUrl(attachment.filePath, expiresInSeconds);

  return NextResponse.json({ url: signedUrl, expiresInSeconds });
}
