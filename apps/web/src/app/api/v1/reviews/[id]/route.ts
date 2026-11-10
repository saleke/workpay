import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkReviewDto } from "@/lib/server/work-review";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: reviewId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    return jsonOk(await buildWorkReviewDto(getDb(), reviewId, user.id));
  } catch (error) {
    return jsonError(error);
  }
}
