import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { getPersonaClient } from "@workpay/shared/integrations";
import { users } from "@workpay/shared/db/schema/identity";

const verifyPersonaSchema = z.object({
  inquiryId: z.string().trim().min(3, "Inquiry ID is required"),
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
  documentNumber: z.string().trim().min(5, "Document number must be at least 5 characters").max(30),
});

export async function POST(req: Request) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Sign in required to verify identity" }, 401);
    }

    const body = await req.json();
    const parsed = verifyPersonaSchema.parse(body);
    const db = getDb();

    const [current] = await db
      .select({ idVerificationStatus: users.idVerificationStatus, legalName: users.legalName })
      .from(users)
      .where(eq(users.id, actor.id))
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

    const persona = getPersonaClient();
    const result = await persona.verifyInquiry({
      inquiryId: parsed.inquiryId,
      legalName: parsed.legalName,
      documentType: parsed.documentType,
      country: parsed.country,
      documentNumber: parsed.documentNumber,
    });

    await db
      .update(users)
      .set({
        legalName: result.legalName,
        idVerificationStatus: "VERIFIED",
        idVerifiedAt: result.verifiedAt,
        idDocumentType: result.documentType,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    return jsonOk({
      success: true,
      status: "VERIFIED",
      verifiedAt: result.verifiedAt.toISOString(),
      documentType: result.documentType,
      legalName: result.legalName,
      checks: result.checks,
      message: "Identity verified successfully via Persona. High-value task thresholds permanently unlocked.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
