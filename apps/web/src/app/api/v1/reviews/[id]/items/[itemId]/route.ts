import { and, eq } from "drizzle-orm";
import { getDb, jsonError } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { getWorkReviewDetail } from "@workpay/shared/domain";
import { workReviewItems } from "@workpay/shared/db/schema/work-reviews";
import { getObjectStorage } from "@workpay/shared/integrations";
import { AppError, notFound, sha256HexOfBytes } from "@workpay/shared/platform";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id: reviewId, itemId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    await getWorkReviewDetail(getDb(), { reviewId, userId: user.id });
    const [item] = await getDb()
      .select()
      .from(workReviewItems)
      .where(and(eq(workReviewItems.id, itemId), eq(workReviewItems.reviewId, reviewId)))
      .limit(1);
    if (!item || item.type !== "FILE" || !item.storageKey || !item.filename || !item.sizeBytes) {
      throw notFound("Review file");
    }
    const bytes = await getObjectStorage().get(item.storageKey);
    if (bytes.byteLength !== item.sizeBytes || sha256HexOfBytes(bytes) !== item.sha256) {
      throw new AppError("INTERNAL_ERROR", "The review file failed its integrity check.");
    }
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const asciiFilename =
      item.filename
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/[\r\n"\\]/g, "_")
        .slice(0, 255) || "review-file";
    const encodedFilename = encodeURIComponent(item.filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(body, {
      headers: {
        "Content-Type": item.contentType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
