import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedSession: vi.fn(),
  withIdempotency: vi.fn(),
}));

vi.mock("@/lib/server/api", () => ({
  getCorrelationId: () => "corr_test",
  jsonError: (error: { code?: string; message?: string }) =>
    Response.json(
      {
        error: {
          code: error.code ?? "INTERNAL_ERROR",
          message: error.message ?? "Internal error",
        },
      },
      { status: error.code === "DOMAIN_CONFLICT" ? 409 : 500 },
    ),
  withIdempotency: mocks.withIdempotency,
}));

vi.mock("@/lib/server/conversation-auth", () => ({
  requireAuthenticatedSession: mocks.requireAuthenticatedSession,
}));

vi.mock("@workpay/shared/domain", () => ({
  createPayPalOrderForTask: vi.fn(),
}));

vi.mock("@workpay/shared/platform", () => ({
  AppError: class AppError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  getEnv: () => ({ APP_URL: "https://tenfo.test" }),
}));

import { POST } from "../../src/app/api/v1/tasks/[id]/payment/order/route";

describe("idempotent route errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedSession.mockResolvedValue({
      actor: { kind: "USER", id: "usr_buyer", role: "buyer" },
    });
  });

  it("maps an asynchronous domain failure to the JSON error envelope", async () => {
    mocks.withIdempotency.mockRejectedValue({
      code: "DOMAIN_CONFLICT",
      message: "The professional must complete PayPal sandbox seller onboarding first.",
    });

    const response = await POST(
      new Request("https://tenfo.test/api/v1/tasks/task_1/payment/order", {
        method: "POST",
        headers: { "Idempotency-Key": "idem_test" },
      }),
      { params: Promise.resolve({ id: "task_1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "DOMAIN_CONFLICT",
        message: "The professional must complete PayPal sandbox seller onboarding first.",
      },
    });
  });
});
