# Component 9 — Payment Decision & Settlement Policy Engine

## 1. Responsibility

The **Payment Decision & Settlement Policy Engine** is the deterministic authority that decides whether an already-authorized payment may move from:

```text
AUTHORIZED
     ↓
RELEASE ELIGIBLE
     ↓
CAPTURE ALLOWED
```

Its responsibility is:

> **Evaluate whether every contractual, verification, authorization, and risk condition required for payment release has been satisfied.**

This component is deliberately separate from:

- **Verification Engine** — determines whether the work passed.
- **PayPal Payment Orchestrator** — performs the actual PayPal operation.
- **AI Agent** — may recommend actions but has no payment authority.

The architecture becomes:

```text
                 ┌─────────────────────┐
                 │ Verification Engine │
                 └──────────┬──────────┘
                            │
                         PASS
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Payment Policy      │
                 │ Engine              │
                 └──────────┬──────────┘
                            │
                       ALLOW CAPTURE
                            │
                            ▼
                 ┌─────────────────────┐
                 │ PayPal Orchestrator │
                 └──────────┬──────────┘
                            │
                            ▼
                         PayPal
```

The key architectural principle is:

> **Passing verification is necessary for payment, but verification alone does not have authority to release money.**

---

# 2. Why This Must Be Its Own Component

A common implementation mistake would be:

```text
if verificationPassed:
    capturePayPalPayment()
```

That is too simplistic.

There are other conditions that may prevent payment.

For example:

```text
Verification:
PASS

But:

Contract:
EXPIRED

Payment:
Already captured

Dispute:
OPEN

Agreement:
CANCELLED

Authorization:
Expired

Budget:
No longer valid
```

Therefore payment release must be a separate policy decision.

The system needs a centralized answer to:

> **“Is this specific payment allowed to move money right now?”**

That answer should come from deterministic policy evaluation.

---

# 3. Architectural Boundary

The component begins with an already-authorized payment and a verification result.

It ends with a formal payment decision.

It does **not** directly communicate with PayPal.

```text
Component 8
Verification
      │
      │ PASS
      ▼
┌──────────────────────────────────┐
│ Payment Policy Engine            │
│                                  │
│ Check contract                   │
│ Check agreement                  │
│ Check payment                    │
│ Check verification               │
│ Check disputes                   │
│ Check authority                  │
│ Evaluate release policy          │
└────────────────┬─────────────────┘
                 │
                 ▼
          Payment Decision
          ├── ALLOW
          └── DENY
                 │
                 ▼
Component 6
PayPal Orchestrator
```

The policy engine must never contain PayPal credentials or call PayPal APIs.

---

# 4. Core Principle

The system should follow this rule:

```text
id="v5q3nr"
PAYMENT MAY BE CAPTURED
IF AND ONLY IF
ALL REQUIRED RELEASE CONDITIONS ARE TRUE.
```

For the MVP:

```text
Verification = PASS
AND
Payment = AUTHORIZED
AND
Commercial Agreement = ACTIVE
AND
Contract = ACTIVE
AND
No unresolved dispute
AND
Payment has not already been captured
AND
Authorization is still valid
```

Only then:

```text
ALLOW_CAPTURE
```

Everything else produces:

```text
DENY_CAPTURE
```

---

# 5. Payment Decision Object

The central domain object is `PaymentDecision`.

```typescript
type PaymentDecision = {
  id: string;

  paymentId: string;

  action:
    | "CAPTURE"
    | "VOID"
    | "REFUND";

  result:
    | "ALLOW"
    | "DENY";

  reasonCode: string;

  reason: string;

  verificationId: string | null;

  contractId: string;

  contractVersion: number;

  contractHash: string;

  agreementId: string;

  agreementHash: string;

  policyVersion: string;

  evaluatedAt: string;
};
```

This record is critical.

The system should not merely execute:

```text
capture(paymentId)
```

It should first produce:

```text
PaymentDecision:
ALLOW
```

and preserve the reason.

---

# 6. Policy Evaluation

The engine evaluates a collection of deterministic predicates.

Conceptually:

```typescript
type PaymentPolicyContext = {
  payment: Payment;
  contract: WorkContract;
  agreement: CommercialAgreement;
  verification: AcceptanceDecision;
  dispute: DisputeState;
  authority: AuthorityPolicy;
};
```

Then:

```typescript
evaluate(context)
```

produces:

```typescript
type PolicyResult = {
  result: "ALLOW" | "DENY";

  reasonCode: string;

  failedChecks: PolicyCheckResult[];

  evaluatedAt: string;

  policyVersion: string;
};
```

---

# 7. Policy Checks

For capture, the engine performs checks such as:

```text
CHECK 1
Payment exists.

CHECK 2
Payment is AUTHORIZED.

CHECK 3
Payment has not already been captured.

CHECK 4
Commercial Agreement is valid.

CHECK 5
Contract version matches the agreement.

CHECK 6
Verification references the same contract version.

CHECK 7
Verification result is PASS.

CHECK 8
No unresolved dispute blocks settlement.

CHECK 9
Payment amount matches the accepted commercial agreement.

CHECK 10
Currency matches the agreement.

CHECK 11
Payment authorization remains valid.

CHECK 12
No cancellation or termination condition blocks settlement.
```

The result is deterministic.

---

# 8. Policy Evaluation Example

Suppose:

```text
Contract:
ACTIVE

Agreement:
ACTIVE

Payment:
AUTHORIZED
$135 USD

Verification:
PASS

Dispute:
NONE
```

Evaluation:

```text
Contract valid          ✓
Agreement valid         ✓
Payment authorized      ✓
Amount matches          ✓
Currency matches       ✓
Verification PASS       ✓
No dispute              ✓
Already captured        ✕
Authorization valid     ✓
```

Final:

```text
ALLOW_CAPTURE
```

The system can now create a capture command.

---

# 9. Denial Example

Suppose the provider submits work and verification passes.

However:

```text
Dispute:
OPEN
```

The policy result becomes:

```text
DENY_CAPTURE
Reason:
OPEN_DISPUTE
```

The payment remains authorized.

No PayPal capture occurs.

This is an important distinction:

> **The system can know that the work passed while still deciding that money should not move yet.**

---

# 10. Why AI Must Not Make This Decision

The AI agent might say:

> “The work passed and the provider has a good reputation. Let's pay them.”

That recommendation can be recorded.

But it cannot be authoritative.

The payment policy engine evaluates the actual state.

```text
AI Recommendation
        │
        ▼
"Capture $135"
        │
        │ NOT AUTHORITY
        ▼
Policy Engine
        │
        ├── contract?
        ├── agreement?
        ├── verification?
        ├── dispute?
        ├── payment state?
        └── authorization?
        │
        ▼
ALLOW / DENY
```

This is one of the strongest security properties of the entire architecture.

---

# 11. Policy Engine as a Deterministic Firewall

The policy engine should effectively behave as a firewall around money.

```text
                 UNTRUSTED / FLEXIBLE
                         │
              AI recommendations
              provider actions
              verification outputs
              user requests
                         │
                         ▼
              ┌───────────────────┐
              │ POLICY ENGINE     │
              │                   │
              │ deterministic     │
              │ rules             │
              │ invariants        │
              │ authority         │
              └─────────┬─────────┘
                        │
                   ALLOW / DENY
                        │
                        ▼
                    PayPal
```

Nothing should bypass it.

---

# 12. Policy Versioning

Payment rules will evolve.

Therefore every decision stores the policy version used.

Example:

```text
policyVersion:
payment-release-v1
```

Later:

```text
payment-release-v2
```

The system can then answer:

> “Why did this payment get released?”

with:

```text
Policy:
payment-release-v1

Decision:
ALLOW

Verification:
PASS

Contract:
v1

Agreement:
v2
```

This is essential for auditability.

---

# 13. Policy Checks Must Be Explicit

Do not hide all payment logic inside one giant function.

Instead:

```typescript
interface PaymentPolicyCheck {
  id: string;

  evaluate(
    context: PaymentPolicyContext
  ): PolicyCheckResult;
}
```

Examples:

```text
AuthorizedPaymentCheck
VerificationPassedCheck
ContractVersionCheck
AgreementStatusCheck
DisputeCheck
CurrencyCheck
AmountCheck
DuplicateCaptureCheck
AuthorizationValidityCheck
CancellationCheck
```

The evaluator combines them.

```text
All mandatory checks PASS
        ↓
ALLOW

Any mandatory check FAIL
        ↓
DENY
```

This makes the system easier to test and explain.

---

# 14. Policy Check Result

Each check should produce an observable result.

```typescript
type PolicyCheckResult = {
  checkId: string;

  result:
    | "PASS"
    | "FAIL"
    | "NOT_APPLICABLE";

  reason: string;

  observedValue?: unknown;

  expectedValue?: unknown;
};
```

Example:

```text
VerificationPassedCheck
PASS

Observed:
PASS

Expected:
PASS
```

Or:

```text
DisputeCheck
FAIL

Observed:
OPEN

Expected:
NONE
```

The UI can therefore explain why payment was blocked.

---

# 15. Payment Decision Is Immutable

Once a payment decision has been made, it should not be overwritten.

If:

```text
Decision #1
DENY
OPEN_DISPUTE
```

and later the dispute is resolved:

```text
Decision #2
ALLOW
```

the system keeps both.

```text
Decision #1
DENY
     ↓
Dispute resolved
     ↓
Decision #2
ALLOW
```

This creates a complete history of economic decisions.

---

# 16. Capture Command

Only an `ALLOW` decision can create a capture command.

Conceptually:

```typescript
type CaptureCommand = {
  id: string;

  paymentDecisionId: string;

  paymentId: string;

  amount: Money;

  currency: string;

  idempotencyKey: string;

  createdAt: string;
};
```

The command references the policy decision.

Therefore the payment service can enforce:

```text
CaptureCommand without ALLOW decision
→ reject
```

This provides defense in depth.

---

# 17. Separation From PayPal

The architecture remains:

```text
Payment Policy
      │
      │ CaptureCommand
      ▼
Payment Service
      │
      ▼
PayPal Adapter
      │
      ▼
PayPal
```

The policy engine should not know:

- PayPal API endpoints
- access tokens
- PayPal SDK details
- HTTP implementation
- webhook formats

That remains Component 6's responsibility.

This separation allows the business policy to remain stable even if the payment provider changes.

---

# 18. Authorization vs Capture

This distinction should be visible throughout the system.

### Authorization

Means:

> Funds have been reserved/authorized according to the commercial agreement.

It does **not** mean the provider has been paid.

### Capture

Means:

> The system has actually requested settlement of the authorized amount.

Therefore the user-facing state should say:

```text
$135 authorized
Payment protected
Not yet released
```

rather than:

```text
$135 paid
```

until capture actually succeeds.

---

# 19. Payment Lifecycle

The combined lifecycle now becomes:

```text
Commercial Agreement
        ↓
Payment Authorization
        ↓
AUTHORIZED
        │
        │ Provider performs work
        ▼
Submission
        ↓
Verification
        │
        ├── FAIL
        │     ↓
        │   Remain AUTHORIZED
        │
        ├── UNCERTAIN
        │     ↓
        │   Remain AUTHORIZED
        │
        └── PASS
              ↓
       Payment Policy
              │
              ├── DENY
              │
              └── ALLOW
                    ↓
                 CAPTURE
```

This is the economic state machine of the product.

---

# 20. Disputes

The policy engine must recognize disputes as a blocking condition.

A dispute may originate from:

- buyer
- provider
- verification uncertainty
- contract interpretation issue
- technical problem
- suspected fraud
- evidence inconsistency

For the MVP, keep the model simple:

```typescript
type DisputeState =
  | "NONE"
  | "OPEN"
  | "RESOLVED_FOR_BUYER"
  | "RESOLVED_FOR_PROVIDER";
```

An open dispute blocks automatic capture.

```text
OPEN_DISPUTE
    ↓
DENY_CAPTURE
```

This is preferable to allowing an AI agent to improvise a dispute resolution.

---

# 21. Dispute Does Not Automatically Mean Refund

If a payment has already been captured, an open dispute does not mean:

```text
automatic refund
```

Instead, a separate refund policy must determine whether a refund is allowed.

For example:

```text
Captured
   ↓
Dispute
   ↓
Dispute Resolution
   ├── Refund
   └── No Refund
```

The same policy architecture can later be reused for:

```text
VOID
REFUND
PARTIAL_REFUND
```

---

# 22. Partial Payments

The system should support the possibility of milestone payments without making the MVP unnecessarily complicated.

A Commercial Agreement could contain:

```typescript
type PaymentMilestone = {
  id: string;

  amount: Money;

  acceptanceRequirementIds: string[];

  status:
    | "PENDING"
    | "ELIGIBLE"
    | "CAPTURED";
};
```

Example:

```text
Milestone 1
$50
First 50% of records
     ↓
Verified
     ↓
Capture $50

Milestone 2
$100
Final dataset
     ↓
Verified
     ↓
Capture $100
```

For the initial implementation, however, a single payment is safer and easier to demonstrate.

The architecture should support milestones without making them mandatory.

---

# 23. Cancellation

Cancellation rules must be deterministic.

If the task is cancelled before capture:

```text
AUTHORIZED
    ↓
Cancellation
    ↓
VOID
```

If payment has already been captured:

```text
CAPTURED
    ↓
Cancellation/refund decision
    ↓
REFUND
```

The policy engine determines whether the action is allowed.

It must never delete the payment record.

---

# 24. Expiration

Payment authorization and contractual deadlines may expire.

The policy engine should distinguish:

```text
Work deadline expired
```

from:

```text
Payment authorization expired
```

They are different facts.

For example:

```text
Contract deadline:
EXPIRED

Payment authorization:
STILL VALID
```

The system may still need to void the authorization depending on the contract policy.

Conversely:

```text
Contract:
ACTIVE

Payment authorization:
EXPIRED
```

means the system cannot capture the old authorization.

A new authorization workflow may be required.

---

# 25. Concurrency Protection

Payment decisions can be triggered by multiple events.

For example:

```text
Verification PASS
       +
User clicks release
       +
Background worker retries
```

All three might attempt to initiate capture.

The policy engine and payment service must protect against duplicate settlement.

Use:

- database row locking where appropriate
- idempotency keys
- unique payment operation constraints
- PayPal idempotency support where applicable
- internal payment state validation

The invariant is:

> **One economic obligation must never produce two successful captures because two parts of the system acted simultaneously.**

---

# 26. Race Condition Example

Suppose:

```text
10:00:01 Verification PASS
10:00:02 Payment policy ALLOW
10:00:03 Capture request starts
10:00:03 User cancels task
```

The system cannot assume that cancellation automatically wins.

It must serialize or reconcile the conflicting operations.

Possible rule:

```text
Once CAPTURE_REQUESTED:
do not issue cancellation as if capture never occurred.

Instead:
reconcile actual PayPal state.
```

The financial truth is always reconciled against the payment provider.

---

# 27. Event-Driven Integration

The policy engine should respond to domain events.

Examples:

```text
VERIFICATION_PASSED
DISPUTE_OPENED
DISPUTE_RESOLVED
CONTRACT_CANCELLED
PAYMENT_AUTHORIZATION_EXPIRED
TASK_CANCELLED
```

Example:

```text
VERIFICATION_PASSED
        ↓
Payment Policy Evaluation
        ↓
ALLOW_CAPTURE
        ↓
CAPTURE_COMMAND_CREATED
```

For:

```text
VERIFICATION_FAILED
```

there is no capture command.

---

# 28. Important Security Property

The system should make it impossible for a frontend request such as:

```http
POST /payments/123/capture
```

to directly cause capture.

Even if an attacker changes the browser request, the backend still evaluates:

```text
Is there a valid ALLOW decision?
```

If not:

```text
403 / policy denial
```

The browser is therefore never the authority.

---

# 29. UX — Payment Release State

The payment state should be highly visible in the task workspace.

### Authorized

```text
┌──────────────────────────────────────────┐
│ Payment                                  │
│                                          │
│ $135 USD                                 │
│ Authorized · Not yet released            │
│                                          │
│ Work is being verified before payment    │
│ is released.                             │
└──────────────────────────────────────────┘
```

### Blocked

```text
┌──────────────────────────────────────────┐
│ Payment                                  │
│                                          │
│ $135 USD                                 │
│ Protected · Release blocked              │
│                                          │
│ Reason: verification failed              │
│                                          │
│ The provider has been asked to correct   │
│ the submitted work.                      │
└──────────────────────────────────────────┘
```

### Eligible

```text
┌──────────────────────────────────────────┐
│ Payment                                  │
│                                          │
│ $135 USD                                 │
│ ✓ Verification passed                    │
│ ✓ Payment release authorized             │
│                                          │
│ Releasing payment...                     │
└──────────────────────────────────────────┘
```

### Captured

```text
┌──────────────────────────────────────────┐
│ Payment                                  │
│                                          │
│ $135 USD                                 │
│ ✓ Paid through PayPal                    │
│                                          │
│ Verification passed before release.      │
└──────────────────────────────────────────┘
```

The UI should make the causal relationship obvious:

```text
Work passed
      ↓
Payment authorized for release
      ↓
Payment captured
```

---

# 30. UX — Activity Timeline

The task timeline should record the economic decision.

Example:

```text
10:05  $135 authorized through PayPal

10:07  Provider submitted work

10:08  Verification failed
       Payment remains protected

10:12  Provider submitted correction

10:13  Verification passed

10:13  Payment release policy approved capture

10:13  $135 captured through PayPal
```

This is much more compelling than simply showing:

```text
Payment: Complete
```

because the user can see **why** the payment happened.

---

# 31. UX — Payment Decision Detail

Advanced users should be able to open:

```text
Payment Decision #PD-1842

Action:
CAPTURE

Decision:
ALLOW

Policy:
payment-release-v1

Checks:
✓ Payment authorized
✓ Contract active
✓ Agreement active
✓ Contract version matched
✓ Verification passed
✓ No dispute
✓ Amount matched
✓ Currency matched
✓ Authorization valid

Result:
Capture permitted
```

This turns the system's trust mechanism into a visible product feature.

---

# 32. Database Model

The core persistence model is:

```text
payment_decisions
payment_policy_checks
capture_commands
dispute_states
```

Relationship:

```text
Payment
   │
   ├── PaymentDecision
   │       └── PolicyChecks
   │
   └── CaptureCommand
```

The original payment remains the financial record.

Decisions explain why actions were allowed or denied.

---

# 33. API / Internal Interface

The primary domain interface is:

```typescript
interface PaymentPolicyEngine {
  evaluateCapture(
    paymentId: string
  ): Promise<PaymentDecision>;
}
```

Internally:

```text
evaluateCapture()
      │
      ├── load payment
      ├── load agreement
      ├── load contract
      ├── load verification
      ├── load dispute state
      ├── execute policy checks
      ├── aggregate result
      ├── persist decision
      └── emit decision event
```

Then:

```text
ALLOW
 ↓
CaptureCommand
 ↓
Payment Service
```

or:

```text
DENY
 ↓
No money movement
```

---

# 34. Observability

The component should produce structured logs for every decision.

Example:

```json
{
  "event": "PAYMENT_POLICY_EVALUATED",
  "paymentId": "pay_123",
  "decision": "ALLOW",
  "action": "CAPTURE",
  "contractVersion": 1,
  "verificationId": "ver_456",
  "policyVersion": "payment-release-v1"
}
```

Metrics can include:

```text
payment_policy_allow_rate
payment_policy_denial_rate
denial_by_reason
verification_to_capture_time
authorized_payment_age
capture_failure_rate
duplicate_capture_prevention_count
```

These become useful both for the hackathon demo and future production monitoring.

---

# 35. Testing Strategy

This component should be heavily unit-tested because it contains financial authority.

Example tests:

```text
PASS verification + authorized payment
→ ALLOW

FAIL verification
→ DENY

UNCERTAIN verification
→ DENY

Open dispute
→ DENY

Cancelled agreement
→ DENY

Contract hash mismatch
→ DENY

Amount mismatch
→ DENY

Currency mismatch
→ DENY

Already captured
→ DENY

Expired authorization
→ DENY
```

Also test combinations:

```text
PASS + OPEN DISPUTE
→ DENY

PASS + CANCELLED CONTRACT
→ DENY

PASS + AUTHORIZATION EXPIRED
→ DENY

PASS + all valid conditions
→ ALLOW
```

The policy engine should have no dependency on an LLM.

That makes these tests deterministic.

---

# 36. Failure Modes

### Policy evaluation failure

If the policy engine cannot establish whether payment is allowed:

```text
NO DECISION
```

must be treated as:

```text
NO CAPTURE
```

Never:

```text
error → default allow
```

The safe default is:

> **Fail closed.**

---

### PayPal capture failure

If policy says:

```text
ALLOW
```

but PayPal returns an error:

```text
Payment remains unresolved.
```

The system does not change the decision to DENY.

Instead, Component 6 handles the external payment failure and reconciliation.

---

### Database failure

If the system cannot persist the decision:

```text
do not issue capture command
```

A money-moving command should not depend on an unpersisted authorization decision.

---

# 37. The Most Important Invariants

### Invariant 1

No capture without an explicit `ALLOW` decision.

### Invariant 2

No `ALLOW` decision without successful verification.

### Invariant 3

Verification must correspond to the exact contract version.

### Invariant 4

An open blocking dispute prevents automatic capture.

### Invariant 5

The payment amount must come from the accepted Commercial Agreement.

### Invariant 6

The browser cannot directly authorize capture.

### Invariant 7

The AI cannot directly authorize capture.

### Invariant 8

Policy evaluation fails closed.

### Invariant 9

Every payment decision is immutable and auditable.

### Invariant 10

Duplicate capture attempts cannot produce duplicate settlement.

---

# 38. Component Interaction

At this point, the architecture forms a very strong chain:

```text
USER
 │
 ▼
Task
 │
 ▼
Work Specification
 │
 ▼
Work Contract
 │
 ▼
Provider Selection
 │
 ▼
Commercial Agreement
 │
 ▼
PayPal Authorization
 │
 ▼
Work Execution
 │
 ▼
Submission
 │
 ▼
Verification
 │
 ├── FAIL ──────→ Revision
 │
 ├── UNCERTAIN ─→ Human Review
 │
 └── PASS
       │
       ▼
Payment Policy
       │
       ├── DENY ──→ Payment remains protected
       │
       └── ALLOW
             │
             ▼
          PayPal Capture
```

This is the core economic control loop of the product.

---

# 39. What Makes This Different

Most agentic payment systems stop at:

```text
AI decides
     ↓
PayPal
```

This architecture introduces:

```text
AI proposes
     ↓
Contract defines obligation
     ↓
Provider performs
     ↓
System verifies
     ↓
Policy evaluates authority
     ↓
PayPal settles
```

That distinction is the product's strongest technical story.

The AI is not being trusted with money.

The AI is being given **bounded economic agency**.

---

# 40. Final Guarantee

When this component completes successfully, the system can say:

> **A deterministic policy engine evaluated the payment against the active contract, accepted commercial agreement, verification result, payment state, and applicable blocking conditions. Only when every required condition was satisfied was payment release authorized.**

The final relationship is:

```text
Verification answers:

"Was the work accepted?"

Payment Policy answers:

"Are we allowed to release the money?"

PayPal answers:

"Did the money actually settle?"
```

Those are three different questions, handled by three different components.

That separation is intentional.

It prevents the most dangerous architectural mistake in an agentic commerce system:

> **letting the same AI decision that evaluates work also become the authority that moves money.**

**Component 9 boundary:**

> **Component 8 establishes that the work satisfied the contract. Component 9 establishes that the payment is authorized for release. Component 6 is then responsible for executing and reconciling the actual PayPal settlement.**