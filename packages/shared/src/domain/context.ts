/**
 * Shared domain context helpers.
 *
 * Services take an explicit `Actor` and a correlation id rather than reading
 * them from ambient request state. This keeps the domain layer independent of
 * Next.js and makes every service directly callable from a job or a test.
 */
import type { ActorType, EventActor } from "../events/envelope.js";
import type { Actor } from "./identity/authorize.js";

/** Convert an authorization actor into the event envelope actor. */
export function toEventActor(actor: Actor): EventActor {
  return { type: actor.kind as ActorType, id: actor.id };
}

/** The system actor. Used for work the platform performs on its own. */
export function systemActor(): Actor {
  return { kind: "SYSTEM", id: null };
}

export function userActor(userId: string, role: Actor["role"] = "buyer"): Actor {
  return { kind: "USER", id: userId, role };
}

export function providerActor(userId: string): Actor {
  return { kind: "PROVIDER", id: userId, role: "provider" };
}

export function reviewerActor(userId: string): Actor {
  return { kind: "REVIEWER", id: userId, role: "admin_reviewer" };
}

/** Column values for the actor_type/actor_id pairs stored on domain rows. */
export function actorColumns(actor: Actor): { actorType: ActorType; actorId: string | null } {
  return { actorType: actor.kind as ActorType, actorId: actor.id };
}
