import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeApprovedPayPalOrder: vi.fn(),
  cancelPayPalOrder: vi.fn(),
  cancelReviewFeeOrder: vi.fn(),
  completeReviewFeePayPal: vi.fn(),
  getDb: vi.fn(),
  requireAuthenticatedSession: vi.fn(),
  requireTaskOwner: vi.fn(),
}));

vi.mock("@/lib/server/api", () => ({
  getCorrelationId: () => "corr_test",
  getDb: mocks.getDb,
}));

vi.mock("@/lib/server/conversation-auth", () => ({
  requireAuthenticatedSession: mocks.requireAuthenticatedSession,
  requireTaskOwner: mocks.requireTaskOwner,
}));

vi.mock("@workpay/shared/domain", () => ({
  authorizeApprovedPayPalOrder: mocks.authorizeApprovedPayPalOrder,
  cancelPayPalOrder: mocks.cancelPayPalOrder,
  cancelReviewFeeOrder: mocks.cancelReviewFeeOrder,
  completeReviewFeePayPal: mocks.completeReviewFeePayPal,
}));

vi.mock("@workpay/shared/platform", () => ({
  getEnv: () => ({ APP_URL: "https://tenfo.test" }),
  logger: { error: vi.fn() },
}));

import { GET as cancelReviewFee } from "../../src/app/api/v1/review-fees/paypal/cancel/route";
import { GET as returnReviewFee } from "../../src/app/api/v1/review-fees/paypal/return/route";
import { GET as cancelTaskPayment } from "../../src/app/api/v1/tasks/[id]/payment/paypal/cancel/route";
import { GET as returnTaskPayment } from "../../src/app/api/v1/tasks/[id]/payment/paypal/return/route";

const taskContext = { params: Promise.resolve({ id: "task_1" }) };

describe("PayPal callback authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the authenticated task owner for payment authorization", async () => {
    const actor = { kind: "USER" as const, id: "usr_owner", role: "buyer" as const };
    mocks.requireTaskOwner.mockResolvedValue({ actor, task: { id: "task_1" } });
    mocks.authorizeApprovedPayPalOrder.mockResolvedValue({ paymentId: "pay_1" });

    const response = await returnTaskPayment(
      new Request("https://tenfo.test/api/return?token=ORDER1&state=STATE1"),
      taskContext,
    );

    expect(mocks.authorizeApprovedPayPalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task_1", actor }),
    );
    expect(response.headers.get("location")).toContain("paypal=authorized");
  });

  it("does not authorize a task payment without an authenticated owner", async () => {
    mocks.requireTaskOwner.mockRejectedValue(new Error("Sign in to continue."));

    const response = await returnTaskPayment(
      new Request("https://tenfo.test/api/return?token=ORDER1&state=STATE1"),
      taskContext,
    );

    expect(mocks.authorizeApprovedPayPalOrder).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("paypal=authorization_failed");
  });

  it("does not cancel a task payment without an authenticated owner", async () => {
    mocks.requireTaskOwner.mockRejectedValue(new Error("Sign in to continue."));

    await cancelTaskPayment(
      new Request("https://tenfo.test/api/cancel?token=ORDER1&state=STATE1"),
      taskContext,
    );

    expect(mocks.cancelPayPalOrder).not.toHaveBeenCalled();
  });

  it("checks the session before loading review-fee callbacks", async () => {
    mocks.requireAuthenticatedSession.mockRejectedValue(new Error("Sign in to continue."));
    const returnRequest = new Request(
      "https://tenfo.test/api/review-return?token=ORDER1&state=STATE1",
    );
    const cancelRequest = new Request(
      "https://tenfo.test/api/review-cancel?token=ORDER1&state=STATE1",
    );

    await returnReviewFee(returnRequest);
    await cancelReviewFee(cancelRequest);

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.completeReviewFeePayPal).not.toHaveBeenCalled();
    expect(mocks.cancelReviewFeeOrder).not.toHaveBeenCalled();
  });
});
