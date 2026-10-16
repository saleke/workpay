/**
 * External integration adapters. Every provider has a deterministic fake that
 * is the default, and a real implementation selected by configuration.
 *
 * Only this package talks to the outside world. Domain modules depend on the
 * interfaces here, never on a concrete SDK.
 */
export * as payments from "./payments/index.js";
export * as storage from "./storage/index.js";

export {
  getPaymentGateway,
  setPaymentGateway,
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
} from "./payments/index.js";

export {
  getObjectStorage,
  setObjectStorage,
  buildStorageKey,
  LocalObjectStorage,
  S3ObjectStorage,
} from "./storage/index.js";
export type { ObjectStorage, PutObjectInput, StoredObject } from "./storage/index.js";
