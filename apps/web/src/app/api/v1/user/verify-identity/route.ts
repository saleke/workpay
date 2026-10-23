import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";

const verifyIdentitySchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(3, "Legal full name must be at least 3 characters")
    .max(100, "Legal full name cannot exceed 100 characters")
    .refine((val) => val.split(/\s+/).length >= 2, {
      message: "Please enter your legal first and last name as shown on your government ID.",
    }),
  documentType: z.enum(["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"], {
    errorMap: () => ({ message: "Please select a valid document type (Passport, Driver License, or National ID)." }),
  }),
  country: z.string().trim().min(2, "Country code is required").max(60),
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
        legalName: users.legalName,
        idVerificationStatus: users.idVerificationStatus,
        idVerifiedAt: users.idVerifiedAt,
        idDocumentType: users.idDocumentType,
      })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (!user) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    const isVerified = user.idVerificationStatus === "VERIFIED";

    return jsonOk({
      status: user.idVerificationStatus || "UNVERIFIED",
      isVerified,
      documentType: user.idDocumentType,
      verifiedAt: user.idVerifiedAt ? user.idVerifiedAt.toISOString() : null,
      legalNameMasked: user.legalName
        ? user.legalName.replace(/(?<=^.).+(?=\s)/, "***").replace(/(?<=\s.).+/, "***")
        : null,
      threshold: {
        milestoneMinor: 100000, // $1,000 threshold
        currency: "USD",
        rule: "Required for individual tasks or cumulative milestone disbursements exceeding $1,000 USD.",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Unauthorized actor" }, 401);
    }
    const actorId = actor.id;
    const body = await req.json();
    const parsed = verifyIdentitySchema.parse(body);
    const db = getDb();

    const [current] = await db
      .select({ idVerificationStatus: users.idVerificationStatus, legalName: users.legalName })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1);

    if (current?.idVerificationStatus === "VERIFIED") {
      return jsonError(
        {
          code: "POLICY_DENIED",
          message: "Government identity is already verified and locked on this account.",
        },
        400,
      );
    }

    const verifiedAt = new Date();

    await db
      .update(users)
      .set({
        legalName: parsed.legalName,
        idVerificationStatus: "VERIFIED",
        idVerifiedAt: verifiedAt,
        idDocumentType: parsed.documentType,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    return jsonOk({
      success: true,
      status: "VERIFIED",
      verifiedAt: verifiedAt.toISOString(),
      documentType: parsed.documentType,
      message: "Identity verified successfully. High-value task thresholds unlocked.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
