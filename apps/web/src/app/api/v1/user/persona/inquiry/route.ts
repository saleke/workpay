import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { getPersonaClient } from "@workpay/shared/integrations";
import { users } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Sign in required to initialize Persona inquiry" }, 401);
    }

    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        legalName: users.legalName,
        email: users.email,
        idVerificationStatus: users.idVerificationStatus,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);

    if (!user) {
      return jsonError({ code: "NOT_FOUND", message: "User account not found" }, 404);
    }

    if (user.idVerificationStatus === "VERIFIED") {
      return jsonError(
        {
          code: "POLICY_DENIED",
          message: "Government identity is already verified and locked on this account.",
        },
        400,
      );
    }

    const nameParts = (user.legalName || user.name || "").trim().split(/\s+/);
    const nameFirst = nameParts[0] || undefined;
    const nameLast = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

    const persona = getPersonaClient();
    const inquiry = await persona.createInquiry({
      referenceId: user.id,
      email: user.email,
      nameFirst,
      nameLast,
    });

    return jsonOk({
      data: {
        inquiryId: inquiry.inquiryId,
        sessionToken: inquiry.sessionToken,
        status: inquiry.status,
        templateId: inquiry.templateId,
        environmentId: inquiry.environmentId,
        hostedUrl: inquiry.hostedUrl,
        isConfigured: inquiry.isConfigured,
      },
      inquiry,
    });
  } catch (err) {
    return jsonError(err);
  }
}
