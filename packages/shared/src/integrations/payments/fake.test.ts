import { describe, expect, it } from "vitest";
import { FakePayPal } from "./fake.js";

const USD = { amountMinor: 5000, currency: "USD" as const };

describe("FakePayPal", () => {
  it("authorizes and returns a deterministic id", async () => {
    const gateway = new FakePayPal();
    const result = await gateway.authorize({
      orderId: "order_1",
      amount: USD,
      description: "test",
      idempotencyKey: "key-1",
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.authorizationId).toBeTruthy();
  });

  it("is idempotent on the authorization idempotency key", async () => {
    const gateway = new FakePayPal();
    const first = await gateway.authorize({
      orderId: "order_1",
      amount: USD,
      description: "test",
      idempotencyKey: "key-1",
    });
    const second = await gateway.authorize({
      orderId: "order_1",
      amount: USD,
      description: "test",
      idempotencyKey: "key-1",
    });
    expect(second).toEqual(first);
  });

  it("captures only once per idempotency key", async () => {
    const gateway = new FakePayPal();
    const first = await gateway.capture({
      authorizationId: "auth_1",
      amount: USD,
      idempotencyKey: "cap-1",
    });
    const second = await gateway.capture({
      authorizationId: "auth_1",
      amount: USD,
      idempotencyKey: "cap-1",
    });
    expect(second).toEqual(first);
    expect(gateway.successfulCaptureCount()).toBe(1);
  });

  it("can be scripted to decline or return unknown", async () => {
    const declined = new FakePayPal({ nextAuthorizeOutcome: "DECLINED" });
    const declinedResult = await declined.authorize({
      orderId: "o",
      amount: USD,
      description: "d",
      idempotencyKey: "k",
    });
    expect(declinedResult.status).toBe("DECLINED");

    const unknown = new FakePayPal({ nextCaptureOutcome: "UNKNOWN" });
    const unknownResult = await unknown.capture({
      authorizationId: "a",
      amount: USD,
      idempotencyKey: "c",
    });
    expect(unknownResult.status).toBe("UNKNOWN");
  });
});
