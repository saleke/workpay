import type { Actor } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";
import { getEnv } from "@workpay/shared/platform";
import { getSessionUser, SESSION_COOKIE_NAME } from "./session";
import { resolveActorAsync } from "./api";

export type IntakeBuyerActor = Actor & { kind: "USER"; id: string; role: "buyer" };

export async function requireIntakeBuyer(req: Request): Promise<IntakeBuyerActor> {
  const env = getEnv();
  let actor: Actor;

  if (env.NODE_ENV === "production" || env.WORKPAY_MODE === "production") {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    let token: string | null = null;
    try {
      token = match?.[1] ? decodeURIComponent(match[1]) : null;
    } catch {
      token = null;
    }
    const user = await getSessionUser(token);
    if (!user) {
      throw new AppError("AUTHORIZATION_ERROR", "Sign in with a buyer account to use task intake.");
    }
    actor = { kind: "USER", id: user.id, role: user.role };
  } else {
    actor = await resolveActorAsync(req, "buyer");
  }

  if (
    !actor.id ||
    actor.kind !== "USER" ||
    actor.role === "provider" ||
    actor.role === "admin_reviewer"
  ) {
    throw new AppError(
      "AUTHORIZATION_ERROR",
      "Only buyer accounts can create or access intake sessions.",
    );
  }

  const buyerActor: IntakeBuyerActor = {
    kind: "USER",
    id: actor.id,
    role: "buyer",
  };
  return buyerActor;
}
