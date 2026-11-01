import { describe, expect, it } from "vitest";
import { paypalRequestId } from "./idempotency.js";

describe("PayPal request IDs", () => {
  it("creates stable UUIDs within PayPal's request-id limit", () => {
    const first = paypalRequestId("contract-change-authorize", "change_123");
    expect(first).toBe(paypalRequestId("contract-change-authorize", "change_123"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.length).toBe(36);
  });

  it("separates operation scopes for the same business identifier", () => {
    expect(paypalRequestId("authorize", "change_123")).not.toBe(
      paypalRequestId("void", "change_123"),
    );
  });
});
