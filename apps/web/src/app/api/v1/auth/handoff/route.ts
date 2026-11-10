import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/server/api";
import { consumeSessionHandoff, setSessionCookie } from "@/lib/server/session";
import { AppError } from "@workpay/shared/platform";

const bodySchema = z.object({ handoff: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export async function POST(req: Request) {
  try {
    const { handoff } = bodySchema.parse(await req.json());
    const tabNonce = req.headers.get("x-workpay-tab");
    if (!tabNonce || !/^[a-f0-9]{64}$/.test(tabNonce)) {
      throw new AppError("AUTHORIZATION_ERROR", "This OAuth return does not match this tab.");
    }
    const session = await consumeSessionHandoff(handoff, tabNonce);
    if (!session) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "This OAuth return expired, was already used, or belongs to another tab.",
      );
    }
    const response = jsonOk({
      data: { user: session.user, sessionToken: session.sessionToken },
    });
    setSessionCookie(response, session.sessionToken);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
