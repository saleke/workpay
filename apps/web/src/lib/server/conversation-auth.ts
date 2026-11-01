import { eq } from "drizzle-orm";
import { getDb, resolveActorAsync } from "./api";
import { tasks } from "@workpay/shared/db/schema/tasks";
import { providers } from "@workpay/shared/db/schema/providers";
import type { Actor } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";
import { getEnv } from "@workpay/shared/platform";
import { getSessionUser, SESSION_COOKIE_NAME } from "./session";

export async function resolveConversationActor(req: Request): Promise<Actor> {
  const env = getEnv();
  if (env.NODE_ENV !== "production" && env.WORKPAY_MODE !== "production") {
    return resolveActorAsync(req);
  }

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
    throw new AppError("AUTHORIZATION_ERROR", "Sign in to access task conversations.");
  }
  return { kind: "USER", id: user.id, role: user.role };
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
