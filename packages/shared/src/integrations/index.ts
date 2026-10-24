/**
 * External integration adapters. Every provider has a deterministic fake that
 * is the default, and a real implementation selected by configuration.
 *
 * Only this package talks to the outside world. Domain modules depend on the
 * interfaces here, never on a concrete SDK.
 */
export * as ai from "./ai/index.js";
export * as email from "./email/index.js";
export * as payments from "./payments/index.js";
export * as storage from "./storage/index.js";

export {
  getEmailClient,
  setEmailClient,
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "./email/index.js";
export type { EmailClient, SendEmailInput, SendEmailResult } from "./email/index.js";

export { getAIClient, setAIClient, FakeAI, OpenAIAI } from "./ai/index.js";
export type {
  AIClient,
  WorkPlan,
  PlanTaskInput,
  SemanticAssessment,
  AssessRequirementInput,
  OfferDraft,
  DraftOfferInput,
} from "./ai/index.js";

export {
  getPaymentGateway,
  setPaymentGateway,
  getPayPalOAuthClient,
  FakePayPal,
  SandboxPayPal,
} from "./payments/index.js";
export type {
  PaymentGateway,
  PayPalUserInfo,
  AuthorizeRequest,
  AuthorizeResult,
  CaptureRequest,
  CaptureResult,
  VoidRequest,
  VoidResult,
  RefundRequest,
  RefundResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "./payments/index.js";

export {
  getObjectStorage,
  setObjectStorage,
  buildStorageKey,
  LocalObjectStorage,
  S3ObjectStorage,
} from "./storage/index.js";
export type { ObjectStorage, PutObjectInput, StoredObject } from "./storage/index.js";
