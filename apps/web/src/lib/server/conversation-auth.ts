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
  if (user.role === "provider") return { kind: "PROVIDER", id: user.id, role: "provider" };
  if (user.role === "admin_reviewer") {
    return { kind: "REVIEWER", id: user.id, role: "admin_reviewer" };
  }
  return { kind: "USER", id: user.id, role: "buyer" };
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
): Promise<Actor & { kind: "USER"; id: string; role: "buyer" }> {
  const actor = await resolveConversationActor(req);
  if (actor.kind !== "USER" || !actor.id || actor.role !== "buyer") {
    throw new AppError("AUTHORIZATION_ERROR", "Sign in with a buyer account.");
  }
  return actor as Actor & { kind: "USER"; id: string; role: "buyer" };
}

export interface ProviderPrincipal {
  actor: Actor & { kind: "PROVIDER"; id: string };
  provider: typeof providers.$inferSelect;
}

export async function requireProviderUser(
  req: Request,
): Promise<Actor & { kind: "PROVIDER"; id: string; role: "provider" }> {
  const actor = await resolveConversationActor(req);
  if (actor.kind !== "PROVIDER" || !actor.id || actor.role !== "provider") {
    throw new AppError("AUTHORIZATION_ERROR", "Sign in with a professional account.");
  }
  return actor as Actor & { kind: "PROVIDER"; id: string; role: "provider" };
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
  return { actor: actor as Actor & { kind: "PROVIDER"; id: string }, provider };
}

export async function requireProviderActor(
  req: Request,
): Promise<Actor & { kind: "PROVIDER"; id: string }> {
  return (await requireProviderPrincipal(req)).actor;
}
