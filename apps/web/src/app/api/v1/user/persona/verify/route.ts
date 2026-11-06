import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { isPersonaIdentityVerified } from "@workpay/shared/domain";
import { getPersonaClient } from "@workpay/shared/integrations";
import { users } from "@workpay/shared/db/schema/identity";

const verifyPersonaSchema = z
  .object({
    inquiryId: z.string().trim().regex(/^inq_[A-Za-z0-9]+$/, "Invalid Persona inquiry ID"),
  })
  .strict();

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError(
        { code: "AUTHORIZATION_ERROR", message: "Sign in required to verify identity" },
        401,
      );
    }

    const parsed = verifyPersonaSchema.parse(await req.json());
    const db = getDb();
    const [current] = await db
      .select({
        id: users.id,
        idVerificationStatus: users.idVerificationStatus,
        idVerificationProvider: users.idVerificationProvider,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);

    if (!current) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    if (isPersonaIdentityVerified(current.idVerificationStatus, current.idVerificationProvider)) {
      return jsonError(
        {
          code: "POLICY_DENIED",
          message: "Persona has already approved an identity verification for this account.",
        },
        400,
      );
    }

    const result = await getPersonaClient().verifyInquiry({
      inquiryId: parsed.inquiryId,
      referenceId: current.id,
    });

    if (result.status === "APPROVED") {
      await db
        .update(users)
        .set({
          idVerificationStatus: "VERIFIED",
          idVerificationProvider: "PERSONA",
          idVerifiedAt: new Date(),
          idDocumentType: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, current.id));
    }

    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
