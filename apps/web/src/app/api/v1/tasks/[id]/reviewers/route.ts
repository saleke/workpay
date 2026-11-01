import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { getTaskReviewerRecommendations } from "@workpay/shared/domain";
import { authorizationError, validationError } from "@workpay/shared/platform";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveActorAsync(req);
    if (actor.kind !== "USER" || !actor.id) throw authorizationError();

    const { id: taskId } = await params;
    const paramsUrl = new URL(req.url);
    const rawDomains = paramsUrl.searchParams.get("domains") ?? "";
    const additionalDomains = rawDomains
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);
    if (additionalDomains.length > 20 || additionalDomains.some((domain) => domain.length > 128)) {
      throw validationError("Provide no more than 20 review domains, each 128 characters or fewer.");
    }

    const result = await getTaskReviewerRecommendations(getDb(), {
      taskId,
      userId: actor.id,
      additionalDomains,
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
