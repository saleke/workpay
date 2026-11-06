export type PersonaDocumentType = "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID";

export type PersonaInquiryStatus =
  | "created"
  | "pending"
  | "completed"
  | "failed"
  | "expired"
  | "approved"
  | "declined"
  | "needs_review";

export interface CreateInquiryOptions {
  referenceId: string;
}

export interface PersonaInquiryResult {
  inquiryId: string;
  status: PersonaInquiryStatus;
  referenceId: string;
  templateId?: string;
  environmentId?: string;
  hostedUrl?: string;
  isConfigured: true;
}

export interface VerifyInquiryOptions {
  inquiryId: string;
  referenceId: string;
}

export interface PersonaVerificationResult {
  inquiryId: string;
  status: "APPROVED" | "PENDING" | "NOT_APPROVED";
}

export interface PersonaWebhookPayload {
  data: {
    id: string;
    type: string;
    attributes: {
      name: string;
      status: string;
      "reference-id"?: string;
      "created-at"?: string;
      payload?: {
        data?: {
          id: string;
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
}
