export type PersonaDocumentType = "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID";

export type PersonaInquiryStatus =
  | "created"
  | "pending"
  | "completed"
  | "failed"
  | "expired"
  | "requires_retry";

export interface CreateInquiryOptions {
  referenceId: string;
  email?: string;
  nameFirst?: string;
  nameLast?: string;
  templateId?: string;
}

export interface PersonaInquiryResult {
  inquiryId: string;
  sessionToken?: string;
  status: PersonaInquiryStatus;
  referenceId: string;
  templateId?: string;
  environmentId?: string;
  hostedUrl?: string;
  isConfigured: boolean;
}

export interface PersonaVerificationChecks {
  documentAuthenticity: "passed" | "failed" | "not_applicable";
  faceMatch: "passed" | "failed" | "not_applicable";
  liveness: "passed" | "failed" | "not_applicable";
  watchlistScreening: "passed" | "failed" | "not_applicable";
}

export interface VerifyInquiryOptions {
  inquiryId: string;
  legalName: string;
  documentType: PersonaDocumentType;
  country: string;
  documentNumber?: string;
}

export interface PersonaVerificationResult {
  success: boolean;
  inquiryId: string;
  status: "VERIFIED" | "FAILED" | "PENDING";
  legalName: string;
  documentType: PersonaDocumentType;
  verifiedAt: Date;
  checks: PersonaVerificationChecks;
  message: string;
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
