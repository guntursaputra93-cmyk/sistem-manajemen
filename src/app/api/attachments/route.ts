import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenantContext } from "@/lib/db";
import { uploadAttachment, AttachmentValidationError, ATTACHMENT_ENTITY_TYPES } from "@/lib/storage/attachments";
import { documentVersions } from "@/drizzle/schema";
import { logAudit, getRequestMeta } from "@/lib/audit/log";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const entityType = formData.get("entityType")?.toString();
  const entityId = formData.get("entityId")?.toString();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
  }
  if (!entityType || !ATTACHMENT_ENTITY_TYPES.includes(entityType as (typeof ATTACHMENT_ENTITY_TYPES)[number])) {
    return NextResponse.json({ error: "entityType tidak valid." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "entityId wajib diisi." }, { status: 400 });
  }

  try {
    const attachment = await withTenantContext(
      { role: session.user.role, companyId: session.user.companyId },
      async (tx) => {
        const uploaded = await uploadAttachment(tx, {
          file,
          companyId: session.user.companyId,
          entityType: entityType as (typeof ATTACHMENT_ENTITY_TYPES)[number],
          entityId,
          uploadedBy: session.user.id,
        });

        // Kasus khusus dokumen: entityId di sini adalah document_version.id.
        // file_attachment_id di-set otomatis ke upload PERTAMA saja (idempotent) —
        // upload berikutnya untuk versi yang sama tetap tersimpan sbg attachment
        // tapi tidak menimpa file kanonik versi ini.
        if (entityType === "dokumen") {
          await tx
            .update(documentVersions)
            .set({ fileAttachmentId: uploaded.id })
            .where(and(eq(documentVersions.id, entityId), isNull(documentVersions.fileAttachmentId)));
        }

        return uploaded;
      }
    );

    const { ipAddress, userAgent } = getRequestMeta(request);
    await logAudit({
      companyId: session.user.companyId,
      userId: session.user.id,
      action: "upload_attachment",
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      metadata: { fileName: attachment.fileName, fileSize: attachment.fileSize },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        uploadedAt: attachment.uploadedAt,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AttachmentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
