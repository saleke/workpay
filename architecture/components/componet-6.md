# Component 6 — Payment Authorization & PayPal Transaction Orchestration

## 6.1 Purpose

Payment Authorization & PayPal Transaction Orchestration is responsible for safely converting an approved Commercial Agreement into an actual PayPal transaction.

Its responsibility is:

> **Determine whether a payment action is authorized by the current contract and commercial agreement, execute the corresponding PayPal operation, maintain an accurate internal payment state, and reconcile that state with PayPal.**

This component is where the system crosses an important boundary:

```text
Before this component:
AI is making decisions about work and commerce.

Inside this component:
The system is moving real money.
```

Therefore this component must be significantly more deterministic than the AI-facing components.

---

# 6.2 The Core Principle

The most important rule in the entire architecture is:

> **The AI may recommend a payment action. It may never directly execute a payment action.**

The architecture must look like:

```text
AI Agent
   │
   │ recommendation
   ▼
Payment Policy Engine
   │
   │ ALLOWED / DENIED
   ▼
Payment Service
   │
   ▼
PayPal Adapter
   │
   ▼
PayPal
```

Never:

```text
LLM
 │
 └──────► PayPal
```

And never:

```text
LLM
 │
 └──────► "capturePayment($135)"
```

without deterministic authorization outside the model.

---

# 6.3 Why This Component Is Different

Previous components primarily dealt with:

- interpretation
- contracts
- provider selection
- negotiation

A mistake there can be corrected through workflow.

A mistake here can move actual money.

For example, an AI might incorrectly conclude:

> “The provider completed the work.”

That statement alone must have **zero authority** to release funds.

The payment system must require something like:

```text
Contract valid
+
Commercial Agreement valid
+
Payment authorized
+
Required work submitted
+
Verification = PASS
+
No unresolved dispute
+
Payment action permitted
```

before capture can occur.

---

# 6.4 Payment Lifecycle

The overall payment lifecycle should be:

```text
Commercial Agreement
        │
        ▼
Payment Created
        │
        ▼
Authorization Requested
        │
        ▼
PayPal Authorization
        │
        ▼
Authorized
        │
        │
        ▼
       WORK
        │
        ▼
   VERIFICATION
        │
   ┌────┴────┐
   │         │
  FAIL      PASS
   │         │
   ▼         ▼
No Capture  Capture
             │
             ▼
          PayPal
             │
             ▼
         CAPTURED
```

The authorization and capture phases are intentionally separate.

---

# 6.5 Why Authorization and Capture Are Separate

The system needs to create a financial commitment without immediately releasing the money.

That allows the system to represent:

> “The money is reserved for this agreement, but the provider has not earned it yet.”

This fits the product thesis extremely well.

The system can say:

```text
$135 authorized
```

while simultaneously saying:

```text
Work:
In progress

Payment:
Not yet released
```

Then:

```text
Verification:
PASS

Payment:
Captured
```

This gives the AI agent economic agency without giving it unrestricted payment authority.

---

# 6.6 Internal Payment Object

The application should maintain its own payment record.

```typescript id="v6q5o1"
type Payment = {
  id: string;

  agreementId: string;

  contractId: string;

  providerId: string;

  amount: Money;

  currency: string;

  status:
    | "PENDING"
    | "AUTHORIZATION_REQUESTED"
    | "AUTHORIZED"
    | "CAPTURE_REQUESTED"
    | "CAPTURED"
    | "VOIDED"
    | "REFUNDED"
    | "FAILED";

  paypalOrderId: string | null;

  paypalAuthorizationId: string | null;

  paypalCaptureId: string | null;

  contractHash: string;

  agreementHash: string;

  createdAt: string;

  updatedAt: string;
};
```

The internal Payment object is the application's representation of the economic transaction.

PayPal remains the external source for PayPal transaction state.

---

# 6.7 Why Internal Payment State Is Necessary

The application should not rely on:

```text
paypal_order_id
```

as its entire payment model.

The application needs to associate the transaction with:

```text
Task
Contract
Commercial Agreement
Provider
Verification
Authority Policy
```

For example:

```text
Task #1842
   │
   ▼
Contract v1
   │
   ▼
Agreement #A91
   │
   ▼
Payment #P52
   │
   ├── PayPal Order
   ├── Authorization
   └── Capture
```

This allows the entire economic chain to be reconstructed.

---

# 6.8 Money Representation

Money must never be represented internally as floating-point values.

Bad:

```text
150.00
```

as a floating-point number.

Use integer minor units.

For USD:

```text
15000 cents
```

Conceptually:

```typescript id="7q4sh9"
type Money = {
  amountMinor: number;
  currency: string;
};
```

Example:

```json id="w4o8a2"
{
  "amountMinor": 13500,
  "currency": "USD"
}
```

This prevents floating-point precision errors from becoming financial bugs.

---

# 6.9 Payment Amount Must Come From the Agreement

This is critical.

The payment amount must not come from:

- the original user prompt
- the LLM
- the provider message
- a browser request
- an arbitrary frontend value

It comes from:

```text id="xq0n9q"
Commercial Agreement
        ↓
Agreed Price
        ↓
Payment
```

For example:

```text
Contract maximum = $150
Agreement price = $135
Payment amount = $135
```

The payment system must never interpret:

```text
maximum budget = $150
```

as:

```text
pay $150
```

---

# 6.10 Payment Creation

After a Commercial Agreement exists, the Payment Service creates an internal payment.

Conceptually:

```text id="xgny3d"
Commercial Agreement
        ↓
Validate agreement
        ↓
Create Payment
        ↓
PENDING
```

Validation includes:

```text
Agreement exists
Contract exists
Contract is active
Agreement is accepted
Agreement is not expired
Amount matches agreement
Currency is allowed
Provider is valid
Contract hash matches
Agreement hash matches
```

---

# 6.11 Payment Authorization

Authorization should be a deterministic operation.

Conceptually:

```text id="9m9eak"
Payment
   ↓
Authorization Policy
   ↓
Allowed?
   │
   ├── NO → DENIED
   │
   ▼
PayPal Adapter
   ↓
PayPal
   ↓
Authorization Result
```

The authorization policy should verify that the transaction is still valid **at the moment the money movement is attempted**.

---

# 6.12 Payment Decision Object

Every significant money-moving decision should produce a persistent decision record.

```typescript id="kq0g42"
type PaymentDecision = {
  id: string;

  paymentId: string;

  requestedAction:
    | "AUTHORIZE"
    | "CAPTURE"
    | "VOID"
    | "REFUND";

  source:
    | "SYSTEM"
    | "VERIFICATION"
    | "USER"
    | "AGENT_RECOMMENDATION";

  reason: string;

  policyResult:
    | "ALLOWED"
    | "DENIED";

  contractHash: string;

  agreementHash: string;

  createdAt: string;
};
```

This gives the system an answer to:

> “Why did the system attempt this payment operation?”

---

# 6.13 Example: Authorization

Suppose:

```text id="v9h4lo"
Agreement:
$135

Contract:
maximum $150

Provider:
Provider C

Payment:
$135
```

Policy evaluation:

```text id="6xiz6o"
Agreement valid                  ✓
Contract active                  ✓
Amount = agreement amount        ✓
Amount <= max authority          ✓
Currency allowed                 ✓
Provider valid                   ✓
Agreement hash matches           ✓
```

Result:

```text id="l6k8io"
ALLOWED
```

Only then does the PayPal adapter execute the external operation.

---

# 6.14 Example: Authorization Denied

Suppose someone attempts:

```text id="29zq7e"
Payment amount:
$175
```

while:

```text
Contract maximum:
$150
```

The Payment Policy Engine returns:

```text id="4p8i3n"
DENIED

Reason:
PAYMENT_EXCEEDS_AUTHORITY
```

No PayPal request is made.

This should be true even if the request originated from your own frontend.

---

# 6.15 The Browser Is Never Trusted

The frontend might send:

```json id="04z5gf"
{
  "amount": 13500
}
```

The backend must not trust that amount.

The backend loads:

```text id="vslk7x"
Payment
 ↓
Commercial Agreement
 ↓
Authoritative amount
```

and determines the amount itself.

The frontend is an interface, not an authority.

---

# 6.16 PayPal Adapter

The application should isolate PayPal-specific logic behind an adapter.

```typescript id="ldm5m8"
interface PaymentProvider {
  createPayment(
    request: CreatePaymentRequest
  ): Promise<CreatePaymentResult>;

  authorizePayment(
    request: AuthorizePaymentRequest
  ): Promise<AuthorizationResult>;

  capturePayment(
    request: CapturePaymentRequest
  ): Promise<CaptureResult>;

  voidPayment(
    request: VoidPaymentRequest
  ): Promise<VoidResult>;

  refundPayment(
    request: RefundPaymentRequest
  ): Promise<RefundResult>;

  getPaymentStatus(
    externalId: string
  ): Promise<PaymentStatus>;
}
```

Then:

```text id="7vr5p1"
Payment Service
      │
      ▼
PaymentProvider interface
      │
      ▼
PayPal Adapter
      │
      ▼
PayPal APIs
```

This keeps the domain logic independent of PayPal-specific API details.

---

# 6.17 Why Use an Adapter

The payment domain should understand concepts like:

```text
authorize
capture
void
refund
```

It should not be filled with PayPal-specific implementation details.

For example:

```text id="x1k6so"
payments/
├── payment.service
├── payment-policy.service
├── payment-reconciliation.service
├── payment-state-machine
└── providers/
      └── paypal.adapter
```

This also makes testing much easier.

---

# 6.18 PayPal API Boundary

Only the PayPal adapter should know:

- PayPal API endpoints
- PayPal request structures
- PayPal IDs
- PayPal-specific error codes
- PayPal-specific transaction states

The rest of the application should work with internal abstractions.

This prevents PayPal-specific details from leaking into:

- contract logic
- negotiation logic
- verification
- UI
- AI agent tools

---

# 6.19 Idempotency

Payment operations must be idempotent.

Suppose the application sends:

```text
Capture Payment
```

and the network times out.

The system does not know whether PayPal captured the money.

It must **not blindly send another capture**.

Instead:

```text id="3f4i3g"
Capture Request
      ↓
Timeout
      ↓
UNKNOWN
      ↓
Query PayPal
      ↓
Determine actual state
```

External payment operations must therefore use stable idempotency keys wherever supported by the relevant PayPal operation.

---

# 6.20 Why This Matters

Without idempotency:

```text
Network timeout
     ↓
Retry
     ↓
Duplicate external operation
```

can potentially become a serious financial problem.

Therefore:

> **Every money-moving command must be safely retryable.**

---

# 6.21 Internal State vs PayPal State

The application has:

```text
Payment.status
```

PayPal has:

```text
PayPal transaction state
```

They are related but not identical.

The system needs a mapping layer.

For example:

```text id="ny5czi"
Internal:
AUTHORIZATION_REQUESTED

PayPal:
request submitted
```

Then:

```text id="7udm2c"
Internal:
AUTHORIZED

PayPal:
authorization confirmed
```

The internal state should only transition when there is sufficient evidence from PayPal.

---

# 6.22 Payment State Machine

A simplified state machine:

```text id="6mkn35"
PENDING
   │
   ▼
AUTHORIZATION_REQUESTED
   │
   ├── FAILED
   │
   ▼
AUTHORIZED
   │
   ├── VOIDED
   │
   ▼
CAPTURE_REQUESTED
   │
   ├── FAILED
   │
   ▼
CAPTURED
   │
   ▼
REFUNDED
```

Invalid transitions must be rejected.

For example:

```text
CAPTURED → AUTHORIZED
```

must never happen.

---

# 6.23 Why State Machines Matter

Without explicit state rules, code can accidentally do:

```text
if verificationPassed:
    capture()
```

without checking whether:

- payment was authorized
- agreement is still valid
- payment wasn't already captured
- payment wasn't voided
- dispute exists
- contract version matches

The state machine makes illegal transitions structurally harder.

---

# 6.24 Capture Is More Restricted Than Authorization

Authorization says:

> “Funds are reserved/authorized for this agreement.”

Capture says:

> **“Release the money because the provider has earned it.”**

Therefore capture needs additional conditions.

A capture policy might require:

```text id="8e5b2n"
Payment is AUTHORIZED
+
Required deliverable submitted
+
Verification = PASS
+
Contract version matches
+
Agreement valid
+
No unresolved dispute
+
No cancellation
+
Payment not already captured
```

Only then:

```text
CAPTURE_ALLOWED
```

---

# 6.25 Verification Is Not Payment

This distinction is important.

The verification component will eventually produce:

```text id="0ypa3m"
PASS
FAIL
UNCERTAIN
```

The payment component should interpret those states according to policy.

For example:

```text id="zj03xh"
PASS
   ↓
Payment policy evaluation
   ↓
Capture allowed?
```

But:

```text id="6g1z6h"
FAIL
   ↓
No capture
```

and:

```text id="y4hl8j"
UNCERTAIN
   ↓
No automatic capture
```

Uncertain must never be treated as pass.

---

# 6.26 AI Verification Output Has No Direct Payment Authority

Even later, when the verification component says:

```text
"Looks good."
```

that is not sufficient.

The system should convert verification into a structured decision:

```typescript id="j21p6w"
type VerificationResult = {
  status:
    | "PASS"
    | "FAIL"
    | "UNCERTAIN";

  contractId: string;

  contractVersion: number;

  submissionId: string;

  checks: VerificationCheck[];

  createdAt: string;
};
```

The payment system then evaluates the structured result.

---

# 6.27 Payment Policy

Conceptually:

```typescript id="a3klj2"
type PaymentPolicyResult = {
  allowed: boolean;

  reasons: string[];

  requiredConditions: string[];

  evaluatedAt: string;
};
```

For capture:

```text id="m33xjz"
IF
payment.status == AUTHORIZED
AND verification.status == PASS
AND verification.contractVersion == agreement.contractVersion
AND no dispute
AND agreement active
THEN
capture allowed
ELSE
capture denied
```

The important part is that this is deterministic application logic.

---

# 6.28 Capture Flow

The capture flow should be:

```text id="1oj2pc"
Verification PASS
        │
        ▼
Capture Request
        │
        ▼
Load Payment
        │
        ▼
Load Agreement
        │
        ▼
Load Contract
        │
        ▼
Load Verification
        │
        ▼
Policy Evaluation
        │
     ┌──┴──┐
    DENY  ALLOW
     │      │
     ▼      ▼
   STOP   PayPal
            │
            ▼
         Capture
            │
            ▼
       Reconcile
            │
            ▼
        CAPTURED
```

---

# 6.29 Preventing a Dangerous Race

Consider:

```text
10:00 Verification passes
10:01 User cancels task
10:01 Capture begins
```

The capture policy must re-check current state.

It should not rely on:

> “Verification passed one minute ago.”

At the moment of capture:

```text
Contract:
ACTIVE? ✓

Payment:
AUTHORIZED? ✓

Cancellation:
No ✓

Dispute:
No ✓

Verification:
PASS ✓
```

Only then capture.

---

# 6.30 Cancellation

Cancellation depends on payment state.

### Authorized but not captured

The system may:

```text
VOID
```

the authorization where supported and appropriate.

### Already captured

The system cannot pretend the payment never happened.

It needs:

```text
REFUND
```

if a refund is permitted.

Therefore:

```text id="7tq8x4"
AUTHORIZED
    ↓
VOID

CAPTURED
    ↓
REFUND
```

Financial records should never simply be deleted.

---

# 6.31 Refunds

Refunds should be treated as a separate money-moving action.

They require policy authorization just like capture.

Possible triggers:

```text id="40n2br"
User-approved refund
Dispute resolution
Post-payment verification failure
System correction
Contract-specific refund rule
```

The system records:

```text id="a5s2bz"
who requested it
why
amount
policy result
PayPal refund ID
timestamp
```

---

# 6.32 Partial Capture

If the product later supports milestones, payment should be able to represent multiple capture units.

For example:

```text id="lqv0q0"
Agreement:
$200

Milestone 1:
$80

Milestone 2:
$120
```

Each milestone can have its own verification condition.

For the MVP, however, a single full capture is much simpler and safer.

The architecture should allow milestones without requiring them for the first demo.

---

# 6.33 Payment Credentials

Payment credentials should never enter:

- prompts
- LLM context
- browser state
- task records
- provider messages
- activity logs

The payment service should use secure server-side credential handling.

The architecture should conceptually be:

```text id="n9f6m7"
Browser
   │
   ▼
Backend
   │
   ▼
Payment Service
   │
   ▼
Secure PayPal Credentials
   │
   ▼
PayPal
```

The LLM should have no access to credentials.

---

# 6.34 PayPal Connection UX

The user needs a clear setup flow before autonomous payment can happen.

The Settings area can contain:

```text id="d3j2qu"
Payments

PayPal
Connected ✓

Permissions
✓ Pay for approved tasks
✓ Authorize within task limits
✓ Capture after verification

Agent limits
Maximum per task: $150
Maximum per day: $500

[Manage PayPal Connection]
```

The UI should make the authority relationship obvious.

---

# 6.35 User Should Know What the Agent Can Spend

The product's trust model depends on clear boundaries.

The user should see:

```text id="v3j3k6"
Your agent can:
✓ spend up to your task limit
✓ negotiate within approved limits
✓ authorize payment for approved work
✓ release payment after verification

Your agent cannot:
✕ increase your budget
✕ pay outside approved tasks
✕ change requirements
✕ release failed work
```

This should appear both:

- during contract approval
- in payment settings

---

# 6.36 Payment Status UI

The task workspace should show payment state.

### Before authorization

```text id="6c2x34"
Payment
Not yet authorized
```

### After authorization

```text id="2g7y4u"
Payment
$135 authorized
Not yet released
```

### Verification failure

```text id="3dyb5u"
Payment
$135 authorized
Release blocked

Reason:
Verification failed
```

### Verification success

```text id="3j4x7h"
Payment
$135 released ✓
```

This makes the economic lifecycle visible.

---

# 6.37 Payment Timeline

The Activity timeline should show:

```text id="v1cmst"
10:05
Commercial agreement reached — $135.

10:06
$135 authorized through PayPal.

10:08
Provider submitted work.

10:09
Verification failed.
Payment remains blocked.

10:13
Provider submitted corrected work.

10:14
Verification passed.

10:14
$135 captured through PayPal.
```

This is one of the strongest demo experiences because it visually connects:

```text
work
→ verification
→ money
```

---

# 6.38 PayPal Webhooks

The system should not rely solely on synchronous API responses.

PayPal can notify the application through webhooks.

The flow becomes:

```text id="1p6x3s"
PayPal
   │
   ▼
Webhook Endpoint
   │
   ▼
Verify webhook authenticity
   │
   ▼
Parse event
   │
   ▼
Check idempotency
   │
   ▼
Update Payment
   │
   ▼
Emit Domain Event
```

The webhook endpoint should treat incoming payloads as untrusted until their authenticity is verified according to PayPal's current webhook mechanism.

---

# 6.39 Webhook Idempotency

The same webhook may potentially be delivered more than once.

Therefore:

```text id="q83fpm"
event_id
```

or the appropriate PayPal event identifier should be stored.

If the event has already been processed:

```text id="4w3y9u"
ignore duplicate
```

without repeating state transitions.

---

# 6.40 Reconciliation Worker

Webhooks are not the only safety mechanism.

The system should have a reconciliation worker.

For example:

```text id="0a7n4m"
Every few minutes:

Find payments in:
AUTHORIZATION_REQUESTED
CAPTURE_REQUESTED
UNKNOWN

       ↓

Query PayPal

       ↓

Compare external state

       ↓

Repair internal state
```

This protects against:

- network failures
- webhook delivery problems
- process crashes
- partial failures

---

# 6.41 Distributed Transaction Problem

The application and PayPal are two different systems.

You can have:

```text id="2drw9n"
Application:
capture requested ✓

PayPal:
capture successful ✓

Application:
crashed before recording result ✗
```

Now the database may say:

```text
CAPTURE_REQUESTED
```

while PayPal says:

```text
CAPTURED
```

This is why reconciliation is required.

The architecture cannot assume a normal database transaction can cover PayPal.

---

# 6.42 Payment Operation Record

Every external operation should have its own record.

Conceptually:

```typescript id="b1zqms"
type PaymentOperation = {
  id: string;

  paymentId: string;

  action:
    | "AUTHORIZE"
    | "CAPTURE"
    | "VOID"
    | "REFUND";

  idempotencyKey: string;

  status:
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED"
    | "UNKNOWN";

  externalReference: string | null;

  requestedAt: string;

  completedAt: string | null;
};
```

This makes retries and reconciliation much easier.

---

# 6.43 Unknown State Is a Real State

The system must explicitly represent uncertainty.

For example:

```text id="w6i7q4"
CAPTURE_REQUESTED
        ↓
Network timeout
        ↓
UNKNOWN
```

Do not convert:

```text UNKNOWN
```

into:

```text FAILED
```

because the capture may have succeeded.

Likewise, do not convert it into:

```text CAPTURED
```

without evidence.

The system must reconcile.

---

# 6.44 Payment Failure

If authorization fails:

```text id="p8o4f1"
Payment
AUTHORIZATION_FAILED
```

The task should not proceed as if the provider has secured payment.

The system can show:

> “PayPal authorization could not be completed. No payment was released.”

Possible user actions:

```text
Retry
Reconnect PayPal
Cancel task
```

---

# 6.45 PayPal Disconnect

If the user's PayPal connection becomes invalid:

```text id="1y0mxx"
Task
   ↓
Payment blocked
```

The system should not automatically switch to another payment source unless explicitly configured.

The user sees:

> “Your PayPal connection needs attention before this task can proceed.”

---

# 6.46 Payment Security Boundary

The entire payment architecture should be:

```text id="pg4r8m"
                         AI
                          │
                   recommendation
                          │
                          ▼
                 ┌─────────────────┐
                 │  Policy Engine  │
                 └────────┬────────┘
                          │
                     ALLOWED?
                       /     \
                     NO       YES
                     │         │
                    STOP       ▼
                        Payment Service
                              │
                              ▼
                         PayPal Adapter
                              │
                              ▼
                            PayPal
```

This is the architectural diagram worth emphasizing in the hackathon presentation.

---

# 6.47 Backend Modules

Inside the modular monolith:

```text id="4n9v4m"
payments/
├── payment.service
├── payment-policy.service
├── payment-state-machine
├── payment-operation.service
├── payment-reconciliation.service
├── webhook.service
└── providers/
      └── paypal.adapter
```

The components are logically separated even though they can live in one deployable backend.

---

# 6.48 Payment API

The frontend should never directly call PayPal for the business transaction.

Instead:

```text id="4fr1cw"
POST /api/tasks/:taskId/payment/authorize
```

or an internal workflow triggers authorization.

The backend:

```text id="wczhqo"
authenticate
↓
authorize user
↓
load task
↓
load agreement
↓
validate payment
↓
evaluate policy
↓
create operation
↓
call PayPal
↓
persist result
```

The exact public API surface can be simplified if payment actions are entirely event-driven.

---

# 6.49 Recommended Event-Driven Trigger

For the autonomous workflow, a better internal pattern is:

```text id="g6n1mv"
COMMERCIAL_AGREEMENT_CREATED
        ↓
Payment Service
        ↓
Authorize Payment
```

Then later:

```text id="byy4zt"
VERIFICATION_PASSED
        ↓
Payment Service
        ↓
Evaluate Capture Policy
        ↓
Capture
```

This makes the workflow composable.

---

# 6.50 Payment Does Not Decide Verification

The payment component should not inspect a CSV or ask an LLM:

> “Does this look correct?”

That belongs to verification.

Payment receives structured evidence:

```text id="3ed8bm"
Verification:
PASS

Contract:
v1

Submission:
submission_84

Required checks:
5/5 passed
```

Then payment determines:

> “Does this verification result satisfy the payment policy?”

This keeps domain responsibilities clean.

---

# 6.51 Auditability

Every financial action should be linked to:

```text id="j0q6u4"
User
Task
Contract
Contract version
Contract hash
Provider
Commercial Agreement
Agreement hash
Payment
PayPal IDs
Payment decision
Verification result
Timestamp
```

This creates a complete chain of evidence.

Conceptually:

```text id="l9w6ri"
USER INTENT
    ↓
CONTRACT
    ↓
PROVIDER
    ↓
AGREEMENT
    ↓
PAYMENT AUTHORIZATION
    ↓
WORK
    ↓
VERIFICATION
    ↓
PAYMENT CAPTURE
```

That chain is arguably the central technical innovation of the product.

---

# 6.52 Financial Records Are Append-Only

Never delete payment history.

Instead of:

```text
DELETE payment
```

use state transitions:

```text
AUTHORIZED
→ VOIDED
```

or:

```text
CAPTURED
→ REFUNDED
```

This preserves financial history.

---

# 6.53 Payment Data Model

At minimum:

```text id="oj5mlw"
payments
payment_operations
payment_decisions
payment_events
paypal_webhook_events
```

Relationships:

```text id="fl0bq4"
Commercial Agreement
        │
        ▼
Payment
   │
   ├── Operations
   │      ├── Authorization
   │      └── Capture
   │
   ├── Decisions
   │
   └── Events
```

---

# 6.54 UX: Payment Is a State, Not a Button

The product should avoid making the experience feel like:

> “Click Pay.”

Instead the task progresses automatically.

For example:

```text id="gk4l6a"
Agreement reached
        ↓
Payment authorized
        ↓
Work underway
        ↓
Verification
        ↓
Payment released
```

This communicates the actual product innovation:

> **Payment is conditional on successful work.**

---

# 6.55 The Strongest Demo Moment

The most compelling state is probably:

```text id="h2q0xk"
┌──────────────────────────────────────────────────────────────┐
│ Payment protected                                            │
│                                                              │
│ $135 authorized through PayPal                              │
│                                                              │
│ Provider submitted a deliverable.                            │
│                                                              │
│ Verification: FAILED                                         │
│                                                              │
│ ✕ Duplicate rate: 7.2%                                      │
│   Required: <1%                                              │
│                                                              │
│ PAYMENT HAS NOT BEEN RELEASED                                │
│                                                              │
│ Provider has been asked to correct the work.                 │
└──────────────────────────────────────────────────────────────┘
```

Then after correction:

```text id="9f77ch"
Verification: PASSED ✓

5 / 5 required checks passed.

Releasing $135 through PayPal...
```

Then:

```text id="n3bqf8"
Payment captured ✓

Task completed.
```

That sequence demonstrates the entire thesis.

---

# 6.56 Security Invariants

The payment component should enforce these as hard invariants.

### Invariant 1

The LLM cannot directly invoke a money-moving PayPal operation.

### Invariant 2

Every payment amount must come from an authoritative Commercial Agreement.

### Invariant 3

Every money-moving operation must pass deterministic policy evaluation.

### Invariant 4

The payment amount cannot exceed the authority granted by the contract.

### Invariant 5

Capture cannot occur without a valid payment authorization.

### Invariant 6

Capture cannot occur automatically when verification is `FAIL` or `UNCERTAIN`.

### Invariant 7

Payment operations must be idempotent.

### Invariant 8

Unknown external transaction states must be reconciled rather than guessed.

### Invariant 9

Financial records are never deleted to hide or correct a transaction.

### Invariant 10

Every financial action must be traceable to its contract and commercial agreement.

---

# 6.57 Failure Matrix

| Failure | System response |
|---|---|
| PayPal authorization rejected | Mark payment failed; do not start paid work |
| Network timeout during authorization | Mark operation unknown; reconcile |
| PayPal capture timeout | Do not retry blindly; reconcile |
| Verification fails | Keep payment authorized; do not capture |
| Verification uncertain | Keep payment blocked; request review |
| User cancels before capture | Void authorization where appropriate |
| User cancels after capture | Follow refund policy |
| PayPal credentials invalid | Block payment; request reconnection |
| Agreement expired | Reject payment action |
| Contract hash mismatch | Reject payment action |
| Duplicate webhook | Ignore after idempotency check |
| Duplicate capture request | Return existing operation/result |
| Provider suspended before capture | Policy evaluation fails; stop |

---

# 6.58 Definition of Done

Payment Authorization & PayPal Transaction Orchestration is complete when the system can:

### Authorize

- create an internal payment from a valid Commercial Agreement
- validate amount and currency
- enforce contract authority
- execute PayPal authorization
- persist PayPal identifiers

### Protect

- prevent LLM direct payment access
- prevent frontend-controlled payment amounts
- enforce deterministic payment policy
- keep credentials outside AI context
- prevent unauthorized capture

### Capture

- accept structured verification results
- require verification PASS
- revalidate agreement and payment state
- execute PayPal capture
- persist capture result

### Recover

- use idempotency
- handle timeouts
- represent unknown states
- reconcile with PayPal
- process webhooks safely

### Audit

- preserve payment decisions
- preserve external transaction IDs
- preserve contract/agreement hashes
- preserve all financial state transitions
- expose the payment lifecycle in the task timeline

---

# 6.59 Final Architectural Guarantee

At the end of this component, the system should be able to guarantee:

> **No AI decision, browser request, provider message, or arbitrary application input can directly move money. Every PayPal transaction is derived from an authorized Commercial Agreement, checked against deterministic policy, executed through a controlled PayPal adapter, made idempotent and recoverable, and linked back to the exact contract and economic terms that justified the transaction.**

The economic chain is now:

```text id="b3t5o4"
USER INTENT
      ↓
WORK SPECIFICATION
      ↓
WORK CONTRACT
      ↓
PROVIDER SELECTION
      ↓
COMMERCIAL AGREEMENT
      ↓
PAYPAL AUTHORIZATION
      ↓
             WORK
              ↓
         VERIFICATION
              ↓
        PAYMENT CAPTURE
              ↓
          COMPLETION
```

The next component is **Work Execution & Deliverable Submission**. That component is where the provider actually receives the contracted work, performs it, submits evidence/deliverables, and creates the artifact that the verification engine will later judge.