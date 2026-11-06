import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { authorizationError, AppError, externalFailure } from "../../platform/errors.js";
import { getEnv, logger } from "../../platform/index.js";
import type {
  CreateInquiryOptions,
  PersonaInquiryResult,
  PersonaVerificationResult,
  VerifyInquiryOptions,
} from "./types.js";

const PERSONA_API_BASE = "https://api.withpersona.com/api/v1";

const inquiryResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z
      .object({
        status: z.string().optional(),
        referenceId: z.string().optional(),
        "reference-id": z.string().optional(),
      })
      .passthrough(),
  }),
  meta: z
    .object({
      oneTimeLink: z.string().url().optional(),
      "one-time-link": z.string().url().optional(),
    })
    .passthrough()
    .optional(),
});

export class PersonaClient {
  private readonly apiKey?: string;
  private readonly templateId?: string;
  private readonly environmentId: string;
  private readonly webhookSecret?: string;

  constructor(options?: {
    apiKey?: string;
    templateId?: string;
    environmentId?: string;
    webhookSecret?: string;
  }) {
    let env: Record<string, string | undefined> = {};
    try {
      env = getEnv() as unknown as Record<string, string | undefined>;
    } catch {
      env = process.env;
    }

    this.apiKey = options?.apiKey || env.PERSONA_API_KEY;
    this.templateId = options?.templateId || env.PERSONA_TEMPLATE_ID;
    this.environmentId = options?.environmentId || env.PERSONA_ENVIRONMENT_ID || "";
    this.webhookSecret = options?.webhookSecret || env.PERSONA_WEBHOOK_SECRET;
  }

  get isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.length > 5 &&
      this.templateId &&
      this.environmentId &&
      this.webhookSecret,
    );
  }

  get hasWebhookSecret(): boolean {
    return Boolean(this.webhookSecret);
  }

  async createInquiry(options: CreateInquiryOptions): Promise<PersonaInquiryResult> {
    if (!this.isConfigured || !this.apiKey || !this.templateId || !this.environmentId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Persona API key, inquiry template, and environment must be configured.",
      );
    }

    let response: Response;
    try {
      response = await fetch(`${PERSONA_API_BASE}/inquiries`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Persona-Version": "2023-01-05",
          "Key-Inflection": "camel",
        },
        body: JSON.stringify({
          data: {
            attributes: { "reference-id": options.referenceId },
            relationships: {
              "inquiry-template": {
                data: { id: this.templateId, type: "inquiry-template" },
              },
            },
          },
          meta: {
            "auto-create-account": false,
            "auto-create-one-time-link": true,
          },
        }),
      });
    } catch (cause) {
      logger.error(
        { errorType: cause instanceof Error ? cause.name : "unknown" },
        "network error creating Persona inquiry",
      );
      throw externalFailure("Persona could not start identity verification.", cause);
    }

    if (!response.ok) {
      logger.warn({ status: response.status }, "Persona API rejected inquiry creation");
      throw externalFailure("Persona could not start identity verification.");
    }

    let parsedResponse: z.infer<typeof inquiryResponseSchema>;
    try {
      parsedResponse = inquiryResponseSchema.parse(await response.json());
    } catch (cause) {
      logger.error(
        { errorType: cause instanceof Error ? cause.name : "unknown" },
        "Persona returned an invalid inquiry response",
      );
      throw externalFailure("Persona returned an invalid identity verification response.", cause);
    }

    const hostedUrl = parsedResponse.meta?.oneTimeLink ?? parsedResponse.meta?.["one-time-link"];
    if (!hostedUrl) {
      throw externalFailure("Persona did not provide a secure verification link.");
    }

    const parsedHostedUrl = new URL(hostedUrl);
    if (
      parsedHostedUrl.protocol !== "https:" ||
      !parsedHostedUrl.hostname.endsWith(".withpersona.com")
    ) {
      throw externalFailure("Persona returned an invalid verification link.");
    }

    const responseReferenceId =
      parsedResponse.data.attributes.referenceId ?? parsedResponse.data.attributes["reference-id"];
    if (responseReferenceId && responseReferenceId !== options.referenceId) {
      throw authorizationError("Persona returned an inquiry for a different account.");
    }

    return {
      inquiryId: parsedResponse.data.id,
      status: "created",
      referenceId: options.referenceId,
      templateId: this.templateId,
      environmentId: this.environmentId,
      hostedUrl,
      isConfigured: true,
    };
  }

  async verifyInquiry(options: VerifyInquiryOptions): Promise<PersonaVerificationResult> {
    if (!this.isConfigured || !this.apiKey) {
      throw new AppError("VALIDATION_ERROR", "Persona API credentials are not configured.");
    }

    let response: Response;
    try {
      response = await fetch(
        `${PERSONA_API_BASE}/inquiries/${encodeURIComponent(options.inquiryId)}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            "Persona-Version": "2023-01-05",
            "Key-Inflection": "camel",
          },
        },
      );
    } catch (cause) {
      logger.error(
        { errorType: cause instanceof Error ? cause.name : "unknown" },
        "network error checking Persona inquiry",
      );
      throw externalFailure("Persona verification status could not be checked.", cause);
    }

    if (!response.ok) {
      logger.warn({ status: response.status }, "Persona API rejected inquiry status request");
      throw externalFailure("Persona verification status could not be checked.");
    }

    let parsedResponse: z.infer<typeof inquiryResponseSchema>;
    try {
      parsedResponse = inquiryResponseSchema.parse(await response.json());
    } catch (cause) {
      logger.error(
        { errorType: cause instanceof Error ? cause.name : "unknown" },
        "Persona returned an invalid inquiry status response",
      );
      throw externalFailure("Persona returned an invalid verification status response.", cause);
    }

    if (parsedResponse.data.id !== options.inquiryId) {
      throw externalFailure("Persona returned a different verification inquiry.");
    }

    const responseReferenceId =
      parsedResponse.data.attributes.referenceId ?? parsedResponse.data.attributes["reference-id"];
    if (!responseReferenceId || responseReferenceId !== options.referenceId) {
      throw authorizationError("This verification inquiry does not belong to your account.");
    }

    const providerStatus = parsedResponse.data.attributes.status?.toLowerCase();
    const status =
      providerStatus === "approved"
        ? "APPROVED"
        : providerStatus === "declined" ||
            providerStatus === "failed" ||
            providerStatus === "expired"
          ? "NOT_APPROVED"
          : "PENDING";

    return { inquiryId: options.inquiryId, status };
  }

  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null,
    secretOverride?: string,
  ): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret || !signatureHeader) return false;

    try {
      const parts = signatureHeader.split(",");
      const timestampPart = parts.find((part) => part.startsWith("t="));
      const signatureParts = parts.filter((part) => part.startsWith("v1="));
      if (!timestampPart || signatureParts.length === 0) return false;

      const timestamp = timestampPart.slice(2);
      const payload = `${timestamp}.${rawBody}`;
      const expectedSignature = createHmac("sha256", secret).update(payload).digest("hex");
      const expectedBuffer = Buffer.from(expectedSignature, "utf8");

      return signatureParts.some((part) => {
        const actualBuffer = Buffer.from(part.slice(3), "utf8");
        return (
          expectedBuffer.length === actualBuffer.length &&
          timingSafeEqual(expectedBuffer, actualBuffer)
        );
      });
    } catch {
      return false;
    }
  }
}

let defaultPersonaClient: PersonaClient | null = null;

export function getPersonaClient(): PersonaClient {
  if (!defaultPersonaClient) {
    defaultPersonaClient = new PersonaClient();
  }
  return defaultPersonaClient;
}

export function setPersonaClient(client: PersonaClient | null): void {
  defaultPersonaClient = client;
}
