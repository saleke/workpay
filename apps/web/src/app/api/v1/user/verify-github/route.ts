import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";

const verifyGithubSchema = z.object({
  githubUsername: z
    .string()
    .trim()
    .min(1, "GitHub username is required")
    .max(39, "GitHub username cannot exceed 39 characters")
    .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i, "Invalid GitHub username format"),
});

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const body = await req.json();
    const parsed = verifyGithubSchema.parse(body);
    const db = getDb();

    const normalizedGithub = parsed.githubUsername.replace(/^@+/, "");
    const verifiedAt = new Date();

    await db
      .update(users)
      .set({
        githubUsername: normalizedGithub,
        githubVerifiedAt: verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    return jsonOk({
      success: true,
      githubUsername: normalizedGithub,
      githubVerifiedAt: verifiedAt.toISOString(),
      badge: "Verified Developer",
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const db = getDb();

    await db
      .update(users)
      .set({
        githubUsername: null,
        githubVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    return jsonOk({
      success: true,
      message: "GitHub account unlinked successfully",
    });
  } catch (err) {
    return jsonError(err);
  }
}
