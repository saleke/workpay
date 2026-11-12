/**
 * External integration adapters. Providers use their configured implementation;
 * identity verification fails closed when Persona is not configured.
 *
 * Only this package talks to the outside world. Domain modules depend on the
 * interfaces here, never on a concrete SDK.
 */
export * as ai from "./ai/index.js";
export * as email from "./email/index.js";
export * as payments from "./payments/index.js";
export * as persona from "./persona/index.js";
export * as storage from "./storage/index.js";

export { getPersonaClient, setPersonaClient, PersonaClient } from "./persona/index.js";
export type {
  PersonaDocumentType,
  PersonaInquiryStatus,
  CreateInquiryOptions,
  PersonaInquiryResult,
  VerifyInquiryOptions,
  PersonaVerificationResult,
  PersonaWebhookPayload,
} from "./persona/index.js";

export {
  getEmailClient,
  isEmailDeliveryConfigured,
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
  resetPaymentGateways,
  getPayPalClient,
  getConfiguredNewPaymentMode,
  getPayPalConfig,
  paypalModeConfigured,
  isPayPalMode,
  paymentModeEnvironment,
  FakePayPal,
  SandboxPayPal,
} from "./payments/index.js";
export type {
  PaymentGateway,
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
  PaymentMode,
  PayPalPaymentMode,
  PayPalEnvironment,
  PayPalConfig,
  CreatePayPalOrderRequest,
  CreatePayPalOrderResult,
  PayPalOrderDetails,
  PayPalResourceDetails,
  PartnerReferralRequest,
  PartnerReferralResult,
  MerchantIntegrationStatus,
} from "./payments/index.js";

export {
  getObjectStorage,
  setObjectStorage,
  buildStorageKey,
  LocalObjectStorage,
  S3ObjectStorage,
} from "./storage/index.js";
export type { ObjectStorage, PutObjectInput, StoredObject } from "./storage/index.js";
