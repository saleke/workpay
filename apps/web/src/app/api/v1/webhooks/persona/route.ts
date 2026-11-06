import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/api";
import { getPersonaClient } from "@workpay/shared/integrations";
import { logger } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(req: NextRequest) {
  try {
    const persona = getPersonaClient();
    if (!persona.isConfigured || !persona.hasWebhookSecret) {
      return NextResponse.json({ error: "Persona webhook is not configured" }, { status: 503 });
    }

    const rawBody = await req.text();
    const signatureHeader = req.headers.get("persona-signature");
    if (!persona.verifyWebhookSignature(rawBody, signatureHeader)) {
      logger.warn("rejected Persona webhook with invalid signature");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const eventAttributes = asRecord(asRecord(asRecord(payload)?.data)?.attributes);
    const eventName = eventAttributes?.name;
    const inquiryData = asRecord(asRecord(eventAttributes?.payload)?.data);
    const inquiryAttributes = asRecord(inquiryData?.attributes);
    const inquiryStatus = inquiryAttributes?.status;

    if (eventName !== "inquiry.approved" || inquiryStatus !== "approved") {
      return NextResponse.json({ received: true });
    }

    const referenceId = inquiryAttributes?.["reference-id"] ?? inquiryAttributes?.referenceId;
    if (typeof referenceId !== "string" || referenceId.length === 0) {
      logger.warn("rejected approved Persona inquiry event without a reference ID");
      return NextResponse.json({ error: "Approved inquiry is missing its reference ID" }, { status: 400 });
    }

    const db = getDb();
    const updated = await db
      .update(users)
      .set({
        idVerificationStatus: "VERIFIED",
        idVerificationProvider: "PERSONA",
        idVerifiedAt: new Date(),
        idDocumentType: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, referenceId))
      .returning({ id: users.id });

    if (updated.length === 0) {
      logger.warn("approved Persona inquiry references an unknown WorkPay user");
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error({ err: String(err) }, "error processing Persona webhook");
    return NextResponse.json({ error: "Internal webhook processing error" }, { status: 500 });
  }
}
