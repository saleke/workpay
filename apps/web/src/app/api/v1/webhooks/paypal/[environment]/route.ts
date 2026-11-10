import { and, eq, or } from "drizzle-orm";
import { getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { paymentOrders, payments, webhookEvents } from "@workpay/shared/db/schema/payments";
import { appendEvent } from "@workpay/shared/events";
import { getPayPalClient } from "@workpay/shared/integrations";
import type { PayPalPaymentMode } from "@workpay/shared/integrations";
import { AppError, getEnv, newCorrelationId, newId, sha256Hex } from "@workpay/shared/platform";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

async function readRawBody(req: Request): Promise<string> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_WEBHOOK_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Webhook body is too large.");
  }
  if (!req.body) throw new AppError("VALIDATION_ERROR", "Webhook body is empty.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new AppError("VALIDATION_ERROR", "Webhook body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(req: Request, { params }: { params: Promise<{ environment: string }> }) {
  try {
    const { environment } = await params;
    const mode: PayPalPaymentMode =
      environment.toLowerCase() === "sandbox"
        ? "PAYPAL_SANDBOX"
        : environment.toLowerCase() === "live"
          ? "PAYPAL_LIVE"
          : (() => {
              throw new AppError("NOT_FOUND", "Webhook endpoint not found.");
            })();
    if (mode === "PAYPAL_LIVE" && !getEnv().PAYPAL_LIVE_ENABLED) {
      throw new AppError("NOT_FOUND", "Webhook endpoint not found.");
    }
    const rawBody = await readRawBody(req);
    const headers = Object.fromEntries(
      [...req.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
    );
    const verification = await getPayPalClient(mode).verifyWebhook({ headers, rawBody });
    if (verification.status === "UNKNOWN") {
      throw new AppError("EXTERNAL_FAILURE", "PayPal webhook verification is unavailable.");
    }
    if (!verification.verified || !verification.eventId || !verification.eventType) {
      throw new AppError("AUTHORIZATION_ERROR", "PayPal webhook signature is invalid.");
    }
    const payload = verification.payload as {
      resource?: {
        id?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    const resourceId = payload.resource?.id;
    const orderId = payload.resource?.supplementary_data?.related_ids?.order_id;
    const db = getDb();
    const [payment] = orderId
      ? await db
          .select({ id: payments.id, taskId: payments.taskId })
          .from(paymentOrders)
          .innerJoin(payments, eq(paymentOrders.paymentId, payments.id))
          .where(
            and(
              eq(paymentOrders.externalOrderId, orderId),
              eq(paymentOrders.mode, mode),
              eq(payments.mode, mode),
            ),
          )
          .limit(1)
      : resourceId
        ? await db
            .select({ id: payments.id, taskId: payments.taskId })
            .from(payments)
            .where(
              and(
                eq(payments.mode, mode),
                or(
                  eq(payments.providerOrderId, resourceId),
                  eq(payments.providerAuthorizationId, resourceId),
                  eq(payments.providerCaptureId, resourceId),
                ),
              ),
            )
            .limit(1)
        : [];
    const receiptId = newId("wh");
    const financiallyRelevant =
      verification.eventType!.startsWith("PAYMENT.") ||
      verification.eventType!.startsWith("CUSTOMER.DISPUTE.");
    const stored = await withTransaction(async (tx) => {
      const [receipt] = await tx
        .insert(webhookEvents)
        .values({
          id: receiptId,
          provider: "PAYPAL",
          mode,
          paymentId: payment?.id ?? null,
          externalEventId: verification.eventId!,
          eventType: verification.eventType!,
          verified: true,
          bodyHash: sha256Hex(rawBody),
          processingStatus: payment
            ? "RECEIVED"
            : financiallyRelevant
              ? "REQUIRES_REVIEW"
              : "PROCESSED",
          lastError:
            !payment && financiallyRelevant
              ? "Verified financial event could not be matched to a payment."
              : null,
          payload: verification.payload as Record<string, unknown>,
          processedAt: !payment && !financiallyRelevant ? new Date() : null,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (!receipt) return false;
      if (payment) {
        await appendEvent(tx, {
          type: "PAYPAL_WEBHOOK_RECEIVED",
          aggregateId: payment.id,
          taskId: payment.taskId,
          actor: { type: "PAYPAL", id: verification.eventId! },
          correlationId: newCorrelationId(),
          payload: {
            taskId: payment.taskId,
            paymentId: payment.id,
            webhookReceiptId: receiptId,
            eventType: verification.eventType!,
            mode,
            resourceId: resourceId ?? null,
            orderId: orderId ?? null,
          },
        });
      }
      return true;
    });
    return jsonOk({ received: true, duplicate: !stored }, stored ? 202 : 200);
  } catch (error) {
    return jsonError(error);
  }
}
