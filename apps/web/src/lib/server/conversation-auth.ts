import { eq } from "drizzle-orm";
import { getDb, resolveActorAsync } from "./api";
import { tasks } from "@workpay/shared/db/schema/tasks";
import { providers } from "@workpay/shared/db/schema/providers";
import type { Actor } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";
import { getRequestSessionToken, getSessionUser, type AuthenticatedUser } from "./session";

export async function resolveConversationActor(req: Request): Promise<Actor> {
  return resolveActorAsync(req);
}

export async function requireTaskOwner(
  req: Request,
  taskId: string,
): Promise<{
  actor: Actor & { kind: "USER"; id: string };
  task: typeof tasks.$inferSelect;
}> {
  const actor = await resolveConversationActor(req);
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || actor.kind !== "USER" || actor.id !== task.userId) {
    throw new AppError("NOT_FOUND", "Task not found.");
  }
  return { actor: actor as Actor & { kind: "USER"; id: string }, task };
}

export async function requireBuyerActor(
  req: Request,
): Promise<Actor & { kind: "USER"; id: string }> {
  const actor = await resolveConversationActor(req);
  if (actor.kind !== "USER" || !actor.id) {
    throw new AppError("AUTHORIZATION_ERROR", "Sign in to access your workspace.");
  }
  return actor as Actor & { kind: "USER"; id: string };
}

export async function requireAuthenticatedSession(req: Request): Promise<{
  actor: Actor & { kind: "USER"; id: string };
  user: AuthenticatedUser;
  sessionToken: string;
}> {
  const sessionToken = getRequestSessionToken(req) ?? "";
  const user = await getSessionUser(sessionToken);
  if (!user) throw new AppError("AUTHORIZATION_ERROR", "Sign in to continue.");
  return {
    actor: { kind: "USER", id: user.id, role: user.role },
    user,
    sessionToken,
  };
}

export interface ProviderPrincipal {
  actor: Actor & { kind: "USER"; id: string };
  provider: typeof providers.$inferSelect;
}

export async function requireProviderUser(
  req: Request,
): Promise<Actor & { kind: "USER"; id: string }> {
  const actor = await resolveConversationActor(req);
  if (actor.kind !== "USER" || !actor.id) {
    throw new AppError("AUTHORIZATION_ERROR", "Sign in to access your professional profile.");
  }
  return actor as Actor & { kind: "USER"; id: string };
}

export async function requireProviderPrincipal(req: Request): Promise<ProviderPrincipal> {
  const actor = await requireProviderUser(req);
  const [provider] = await getDb()
    .select()
    .from(providers)
    .where(eq(providers.userId, actor.id))
    .limit(1);
  if (!provider) {
    throw new AppError(
      "AUTHORIZATION_ERROR",
      "A professional profile is required to access professional work.",
    );
  }
  return { actor, provider };
}

export async function requireProviderActor(
  req: Request,
): Promise<Actor & { kind: "USER"; id: string }> {
  return (await requireProviderPrincipal(req)).actor;
}
