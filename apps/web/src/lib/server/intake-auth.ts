import type { Actor } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";
import { resolveActorAsync } from "./api";

export type IntakeBuyerActor = Actor & { kind: "USER"; id: string };

export async function requireIntakeBuyer(req: Request): Promise<IntakeBuyerActor> {
  const actor = await resolveActorAsync(req, "buyer");
  if (!actor.id || actor.kind !== "USER") {
    throw new AppError("AUTHORIZATION_ERROR", "Sign in to create or access intake sessions.");
  }
  return { kind: "USER", id: actor.id, role: actor.role };
}
