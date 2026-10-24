import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(100).optional(),
  username: z.string().trim().optional(),
  legalName: z.string().trim().optional(),
});

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const db = getDb();

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        displayName: users.displayName,
        legalName: users.legalName,
        email: users.email,
        emailVerified: users.emailVerified,
        role: users.role,
        image: users.image,
        githubUsername: users.githubUsername,
        githubVerifiedAt: users.githubVerifiedAt,
        idVerificationStatus: users.idVerificationStatus,
        idVerifiedAt: users.idVerifiedAt,
        idDocumentType: users.idDocumentType,
        paypalPayerId: users.paypalPayerId,
        paypalPayoutEmail: users.paypalPayoutEmail,
        paypalLinkedAt: users.paypalLinkedAt,
        paypalVerified: users.paypalVerified,
        paypalAutoHoldEnabled: users.paypalAutoHoldEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (!user) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    const userPayload = {
      ...user,
      displayName: user.displayName || user.name,
      idVerificationStatus: user.idVerificationStatus || "UNVERIFIED",
      paypalVerified: Boolean(user.paypalVerified),
      paypalAutoHoldEnabled: user.paypalAutoHoldEnabled ?? true,
    };

    return jsonOk({
      data: { user: userPayload },
      user: userPayload,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const body = await req.json();
    const parsed = updateProfileSchema.parse(body);
    const db = getDb();

    const [current] = await db
      .select()
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (!current) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    // Guard: usernames are strictly locked and immutable
    if (parsed.username !== undefined && parsed.username !== current.username) {
      return jsonError(
        {
          code: "POLICY_DENIED",
          message:
            "Platform usernames (@handle) are permanently locked for audit receipts and cryptographic contract integrity. Username cannot be altered.",
        },
        400,
      );
    }

    // Guard: verified legal names are locked
    if (
      parsed.legalName !== undefined &&
      current.idVerificationStatus === "VERIFIED" &&
      parsed.legalName !== current.legalName
    ) {
      return jsonError(
        {
          code: "POLICY_DENIED",
          message:
            "Verified government legal identity is permanently locked. Contact institutional compliance to request a legal name change.",
        },
        400,
      );
    }

    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (parsed.displayName) {
      updates.displayName = parsed.displayName;
      updates.name = parsed.displayName;
    }

    await db.update(users).set(updates).where(eq(users.id, actorId));

    // Keep provider display name in sync if provider record exists
    if (parsed.displayName) {
      await db
        .update(providers)
        .set({ displayName: parsed.displayName, updatedAt: new Date() })
        .where(eq(providers.userId, actorId));
    }

    const [updatedUser] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        displayName: users.displayName,
        legalName: users.legalName,
        email: users.email,
        role: users.role,
        image: users.image,
        githubUsername: users.githubUsername,
        githubVerifiedAt: users.githubVerifiedAt,
        idVerificationStatus: users.idVerificationStatus,
        idVerifiedAt: users.idVerifiedAt,
        idDocumentType: users.idDocumentType,
        paypalPayerId: users.paypalPayerId,
        paypalPayoutEmail: users.paypalPayoutEmail,
        paypalLinkedAt: users.paypalLinkedAt,
        paypalVerified: users.paypalVerified,
        paypalAutoHoldEnabled: users.paypalAutoHoldEnabled,
      })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    return jsonOk({
      data: { user: updatedUser },
      user: updatedUser,
    });
  } catch (err) {
    return jsonError(err);
  }
}
