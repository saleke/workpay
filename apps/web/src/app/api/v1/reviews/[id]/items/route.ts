import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";
import { addWorkReviewItem, getWorkReviewDetail } from "@workpay/shared/domain";
import { buildStorageKey, getObjectStorage } from "@workpay/shared/integrations";
import { AppError, newId, sha256HexOfBytes } from "@workpay/shared/platform";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadedKey: string | null = null;
  try {
    const { id: reviewId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    const detail = await getWorkReviewDetail(getDb(), { reviewId, userId: user.id });
    const form = await req.formData();
    const type = String(form.get("type") ?? "");
    if (type !== "NOTE" && type !== "LINK" && type !== "FILE") {
      throw new AppError("VALIDATION_ERROR", "Review context type is invalid.");
    }
    const label = String(form.get("label") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const url = String(form.get("url") ?? "").trim();
    const file = form.get("file");
    const common = {
      reviewId,
      actor,
      type,
      ...(label ? { label } : {}),
      ...(note ? { note } : {}),
      correlationId: getCorrelationId(req),
    } as const;
    if (type === "FILE") {
      if (!(file instanceof File) || file.size < 1 || file.size > 25 * 1024 * 1024) {
        throw new AppError("VALIDATION_ERROR", "Choose a non-empty file no larger than 25 MB.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      uploadedKey = buildStorageKey(`reviews/${detail.task.id}`, newId("writem"), file.name);
      await getObjectStorage().put({
        key: uploadedKey,
        body: bytes,
        contentType: file.type || "application/octet-stream",
      });
      await withTransaction((tx) =>
        addWorkReviewItem(tx, {
          ...common,
          type: "FILE",
          storageKey: uploadedKey!,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: bytes.byteLength,
          sha256: sha256HexOfBytes(bytes),
        }),
      );
    } else {
      await withTransaction((tx) =>
        addWorkReviewItem(tx, {
          ...common,
          type,
          ...(type === "LINK" ? { url } : {}),
        }),
      );
    }
    return jsonOk(await buildWorkReviewDto(getDb(), reviewId, user.id), 201);
  } catch (error) {
    if (uploadedKey)
      await getObjectStorage()
        .delete(uploadedKey)
        .catch(() => undefined);
    return jsonError(error);
  }
}
