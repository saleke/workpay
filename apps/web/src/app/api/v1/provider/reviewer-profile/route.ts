import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import {
  getReviewerProfile,
  reviewerProfileInputSchema,
  saveReviewerProfile,
} from "@workpay/shared/domain";
import { authorizationError, validationError } from "@workpay/shared/platform";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (actor.kind === "REVIEWER" || !actor.id) throw authorizationError();
    const profile = await getReviewerProfile(getDb(), actor.id);
    return jsonOk({ profile });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (actor.kind === "REVIEWER" || !actor.id) throw authorizationError();

    const parsed = reviewerProfileInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      throw validationError("Reviewer profile is invalid.", parsed.error.flatten());
    }

    const profile = await saveReviewerProfile(getDb(), actor.id, parsed.data);
    return jsonOk({ profile });
  } catch (err) {
    return jsonError(err);
  }
}
