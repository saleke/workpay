import { describe, expect, it } from "vitest";
import { PersonaClient } from "./client.js";
import { createHmac } from "node:crypto";

describe("Persona Integration Client", () => {
  it("initializes in sandbox mode when API key is omitted", () => {
    const client = new PersonaClient({
      environmentId: "sandbox",
      templateId: "itmpl_test_123",
    });

    expect(client.isConfigured).toBe(false);
  });

  it("creates high-fidelity simulated sandbox inquiries", async () => {
    const client = new PersonaClient({
      environmentId: "sandbox",
      templateId: "itmpl_workpay_idv",
    });

    const inquiry = await client.createInquiry({
      referenceId: "user_test_999",
      email: "engineer@company.org",
      nameFirst: "Elena",
      nameLast: "Rostova",
    });

    expect(inquiry.inquiryId).toMatch(/^inq_[a-f0-9]{16}$/);
    expect(inquiry.sessionToken).toMatch(/^ses_[a-f0-9]{32}$/);
    expect(inquiry.status).toBe("created");
    expect(inquiry.referenceId).toBe("user_test_999");
    expect(inquiry.environmentId).toBe("sandbox");
    expect(inquiry.hostedUrl).toContain(inquiry.inquiryId);
  });

  it("completes verification with all automated checks passed", async () => {
    const client = new PersonaClient();

    const result = await client.verifyInquiry({
      inquiryId: "inq_test_abc123",
      legalName: "Elena Rostova",
      documentType: "PASSPORT",
      country: "US",
      documentNumber: "P987654321",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("VERIFIED");
    expect(result.legalName).toBe("Elena Rostova");
    expect(result.documentType).toBe("PASSPORT");
    expect(result.checks.documentAuthenticity).toBe("passed");
    expect(result.checks.faceMatch).toBe("passed");
    expect(result.checks.liveness).toBe("passed");
    expect(result.checks.watchlistScreening).toBe("passed");
    expect(result.verifiedAt).toBeInstanceOf(Date);
  });

  it("validates Persona webhook HMAC SHA-256 signatures", () => {
    const secret = "whsec_test_secret_persona_998877";
    const client = new PersonaClient({ webhookSecret: secret });

    const rawBody = JSON.stringify({
      data: {
        id: "inq_webhook_test_123",
        type: "inquiry",
        attributes: { status: "completed" },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${timestamp}.${rawBody}`;
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    const header = `t=${timestamp},v1=${signature}`;

    expect(client.verifyWebhookSignature(rawBody, header)).toBe(true);

    // Rejects tampered body
    expect(client.verifyWebhookSignature(rawBody + "tampered", header)).toBe(false);

    // Rejects bad signature
    const badHeader = `t=${timestamp},v1=bad_signature_here`;
    expect(client.verifyWebhookSignature(rawBody, badHeader)).toBe(false);

    // Rejects missing secret
    const unconfiguredClient = new PersonaClient({ webhookSecret: undefined });
    expect(unconfiguredClient.verifyWebhookSignature(rawBody, header)).toBe(false);
  });
});
