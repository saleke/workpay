import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/api";
import { getPersonaClient } from "@workpay/shared/integrations";
import { logger } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("persona-signature");
    const persona = getPersonaClient();

    if (persona.isConfigured && !persona.verifyWebhookSignature(rawBody, signatureHeader)) {
      logger.warn({ signatureHeader }, "invalid persona webhook signature");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const eventData = payload.data as {
      id?: string;
      type?: string;
      attributes?: {
        name?: string;
        status?: string;
        payload?: {
          data?: {
            id?: string;
            attributes?: {
              status?: string;
              "reference-id"?: string;
              "name-first"?: string;
              "name-last"?: string;
              fields?: Record<string, { value?: unknown }>;
            };
          };
        };
      };
    };

    const eventName = eventData?.attributes?.name || "";
    const inquiryPayload = eventData?.attributes?.payload?.data;
    const inquiryAttributes = inquiryPayload?.attributes;
    const referenceId = inquiryAttributes?.["reference-id"];
    const inquiryStatus = inquiryAttributes?.status || "";

    logger.info(
      { eventName, referenceId, inquiryStatus },
      "received persona webhook event",
    );

    if (
      (eventName === "inquiry.completed" || eventName === "inquiry.approved" || inquiryStatus === "completed") &&
      referenceId
    ) {
      const db = getDb();
      const firstName = inquiryAttributes?.["name-first"] || "";
      const lastName = inquiryAttributes?.["name-last"] || "";
      const legalName = [firstName, lastName].filter(Boolean).join(" ").trim();

      const updates: Partial<typeof users.$inferInsert> = {
        idVerificationStatus: "VERIFIED",
        idVerifiedAt: new Date(),
        updatedAt: new Date(),
      };

      if (legalName) {
        updates.legalName = legalName;
      }

      await db.update(users).set(updates).where(eq(users.id, referenceId));
      logger.info({ userId: referenceId, legalName }, "verified user identity from persona webhook");
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err: String(err) }, "error processing persona webhook");
    return NextResponse.json({ error: "Internal webhook processing error" }, { status: 500 });
  }
}
