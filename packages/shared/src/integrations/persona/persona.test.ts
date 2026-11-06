import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonaClient } from "./client.js";

const userId = "user_test_999";
const inquiryId = "inq_test_123";

function configuredClient() {
  return new PersonaClient({
    apiKey: "persona_test_api_key",
    templateId: "itmpl_test_123",
    environmentId: "env_test_123",
    webhookSecret: "whsec_test_secret",
  });
}

function personaInquiryResponse(status: string, referenceId = userId) {
  return new Response(
    JSON.stringify({
      data: {
        id: inquiryId,
        attributes: { status, referenceId },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Persona Integration Client", () => {
  it("does not simulate inquiry creation without provider credentials", async () => {
    const client = new PersonaClient({
      environmentId: "env_test_123",
      templateId: "itmpl_test_123",
    });

    expect(client.isConfigured).toBe(false);
    await expect(client.createInquiry({ referenceId: userId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("keeps Persona unavailable when only part of its configuration is present", async () => {
    const client = new PersonaClient({
      apiKey: "persona_test_api_key",
      templateId: "itmpl_test_123",
      environmentId: "env_test_123",
    });

    expect(client.isConfigured).toBe(false);
    await expect(client.createInquiry({ referenceId: userId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(client.verifyInquiry({ inquiryId, referenceId: userId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("creates an inquiry and requires Persona's one-time hosted link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: inquiryId,
            attributes: { status: "created", referenceId: userId },
          },
          meta: { oneTimeLink: "https://inquiry.withpersona.com/verify?code=one-time" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const inquiry = await configuredClient().createInquiry({ referenceId: userId });

    expect(inquiry).toMatchObject({
      inquiryId,
      status: "created",
      referenceId: userId,
      templateId: "itmpl_test_123",
      environmentId: "env_test_123",
      hostedUrl: "https://inquiry.withpersona.com/verify?code=one-time",
      isConfigured: true,
    });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.withpersona.com/api/v1/inquiries");
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      data: {
        attributes: { "reference-id": userId },
        relationships: {
          "inquiry-template": { data: { id: "itmpl_test_123", type: "inquiry-template" } },
        },
      },
      meta: { "auto-create-account": false, "auto-create-one-time-link": true },
    });
  });

  it("rejects failed Persona requests instead of returning a simulated inquiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(configuredClient().createInquiry({ referenceId: userId })).rejects.toMatchObject({
      code: "EXTERNAL_FAILURE",
    });
  });

  it("rejects hosted links outside Persona's secure domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { id: inquiryId, attributes: { status: "created", referenceId: userId } },
            meta: { oneTimeLink: "https://attacker.example/verify" },
          }),
          { status: 201 },
        ),
      ),
    );

    await expect(configuredClient().createInquiry({ referenceId: userId })).rejects.toMatchObject({
      code: "EXTERNAL_FAILURE",
    });
  });

  it("accepts only Persona's approved status for the inquiry owner", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(personaInquiryResponse("approved")));

    await expect(
      configuredClient().verifyInquiry({ inquiryId, referenceId: userId }),
    ).resolves.toEqual({ inquiryId, status: "APPROVED" });
  });

  it.each(["created", "pending", "completed", "needs review"])(
    "keeps %s Persona inquiries pending",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(personaInquiryResponse(status)));

      await expect(
        configuredClient().verifyInquiry({ inquiryId, referenceId: userId }),
      ).resolves.toEqual({ inquiryId, status: "PENDING" });
    },
  );

  it.each(["declined", "failed", "expired"])(
    "does not approve %s Persona inquiries",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(personaInquiryResponse(status)));

      await expect(
        configuredClient().verifyInquiry({ inquiryId, referenceId: userId }),
      ).resolves.toEqual({ inquiryId, status: "NOT_APPROVED" });
    },
  );

  it("rejects inquiries associated with a different WorkPay user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(personaInquiryResponse("approved", "user_other")),
    );

    await expect(
      configuredClient().verifyInquiry({ inquiryId, referenceId: userId }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });

  it("validates Persona webhook HMAC signatures", () => {
    const secret = "whsec_test_secret_persona_998877";
    const client = new PersonaClient({ webhookSecret: secret });
    const rawBody = JSON.stringify({ data: { attributes: { name: "inquiry.approved" } } });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

    expect(client.verifyWebhookSignature(rawBody, `t=${timestamp},v1=${signature}`)).toBe(true);
    expect(
      client.verifyWebhookSignature(rawBody + "tampered", `t=${timestamp},v1=${signature}`),
    ).toBe(false);
    expect(client.verifyWebhookSignature(rawBody, `t=${timestamp},v1=invalid`)).toBe(false);
    expect(
      new PersonaClient().verifyWebhookSignature(rawBody, `t=${timestamp},v1=${signature}`),
    ).toBe(false);
  });
});
