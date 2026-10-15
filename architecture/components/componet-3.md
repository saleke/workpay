# Component 3 — Work Contract Compiler & Approval Architecture

## 3.1 Purpose

The Work Contract Compiler converts a validated Work Specification into a formal, versioned, machine-enforceable **Work Contract**.

The Work Specification answers:

> “What does the system believe the user wants?”

The Work Contract answers:

> **“What exactly will the system require from a provider, how will success be determined, and what economic conditions must be satisfied before payment can occur?”**

This is the first component where the system defines the rules that downstream economic operations must obey.

The contract becomes the authoritative source of truth for:

- provider selection
- negotiation boundaries
- work execution
- verification
- payment authorization
- payment capture
- dispute handling

The core relationship is:

```text id="r3v1qj"
User Request
     ↓
Work Specification
     ↓
Work Contract
     ↓
Economic Execution
```

Once the contract becomes active, downstream components must not reinterpret the original request independently.

---

# 3.2 Why a Contract Is Necessary

A normal task-management application might stop at:

> “The user wants someone to clean a CSV.”

That is insufficient for autonomous economic activity.

The system eventually needs to determine:

- What exactly must be delivered?
- What is outside the scope?
- What constitutes successful completion?
- What evidence is required?
- What is the maximum budget?
- What payment conditions apply?
- What is the agent allowed to negotiate?
- What happens if the work fails?
- What happens if the provider requests a scope change?
- What happens if verification is uncertain?

Without these rules, every downstream component would make its own interpretation.

That creates a dangerous architecture:

```text id="2hpg41"
Provider Service → interprets task one way
Negotiator       → interprets task another way
Verifier         → interprets task another way
Payment Service  → interprets task another way
```

Instead:

```text id="o8p1ws"
                    WORK CONTRACT
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Provider       Verification     Payment
      Selection                         │
                                        ▼
                                    Settlement
```

The contract is the shared source of truth.

---

# 3.3 Core Principle

> **The Work Specification describes intent. The Work Contract makes that intent enforceable.**

This distinction must be maintained throughout the architecture.

The planner may say:

> “The user appears to want duplicate records removed.”

The contract must say either:

> “Remove duplicate records according to the following definition.”

or:

> “This requirement is unresolved and cannot yet become active.”

The contract cannot contain ambiguity that could later determine whether money is owed.

---

# 3.4 Contract Creation Preconditions

A Work Contract may only be compiled from a Work Specification that is:

```text id="5x1l9v"
VALID
+
READY
+
SUFFICIENTLY SPECIFIC
```

A specification that still contains blocking clarification requirements cannot become an active contract.

Therefore:

```text id="3b7p6y"
Work Specification
        │
        ├── incomplete → STOP
        │
        └── ready
              ↓
        Contract Compiler
```

The compiler must reject incomplete specifications.

---

# 3.5 Work Contract Object

The central domain object is:

```typescript id="f8q7wv"
type WorkContract = {
  id: string;

  taskId: string;

  version: number;

  status:
    | "DRAFT"
    | "AWAITING_APPROVAL"
    | "ACTIVE"
    | "COMPLETED"
    | "CANCELLED"
    | "EXPIRED"
    | "DISPUTED";

  objective: string;

  scope: {
    included: ScopeItem[];
    excluded: ScopeItem[];
  };

  requirements: ContractRequirement[];

  constraints: ContractConstraint[];

  inputs: ContractInput[];

  deadline: string | null;

  budget: Money;

  acceptance: AcceptancePolicy;

  payment: PaymentPolicy;

  authority: AuthorityPolicy;

  amendmentPolicy: AmendmentPolicy;

  escalationPolicy: EscalationPolicy;

  specificationVersion: number;

  contractHash: string;

  createdAt: string;

  activatedAt: string | null;
};
```

The contract is versioned from the beginning.

---

# 3.6 Contract Sections

A contract should be composed of explicit sections.

```text id="r43w8e"
WORK CONTRACT
│
├── Objective
├── Scope
├── Requirements
├── Constraints
├── Inputs
├── Deadline
├── Budget
├── Acceptance Criteria
├── Payment Conditions
├── Agent Authority
├── Amendment Rules
└── Escalation Rules
```

Every section exists for a reason.

---

# 3.7 Objective

The objective explains what the work is intended to accomplish.

Example:

> Clean the supplied customer dataset so that it is ready for import into the customer's CRM.

The objective is descriptive.

It should not itself be the only basis for verification.

The measurable requirements and acceptance criteria provide the enforcement layer.

---

# 3.8 Scope

Scope defines what is included and excluded.

Example:

```text id="p5m9m6"
Included:
- customers.csv
- duplicate detection
- email normalization
- preserving customer IDs

Excluded:
- enriching customer records
- adding external customer information
- changing customer IDs
- redesigning the dataset schema
```

This is critical for preventing scope creep.

A provider should not later be told:

> “We expected you to also enrich the database.”

if enrichment was never included.

---

# 3.9 Requirements

Each contractual requirement should contain provenance.

```typescript id="3zj7xr"
type ContractRequirement = {
  id: string;

  description: string;

  source:
    | "USER_EXPLICIT"
    | "USER_CLARIFIED"
    | "DETERMINISTICALLY_DERIVED";

  sourceReference: string;

  verificationMethod: VerificationMethod;

  mandatory: boolean;
};
```

Importantly, the active contract should not contain an unconfirmed:

```text
AI_PROPOSED
```

requirement.

AI proposals must first be confirmed by the user or otherwise become explicitly authorized through the product's defined confirmation mechanism.

---

# 3.10 Contractual Acceptance Criteria

This is one of the most important sections.

The contract must define how the system determines whether work is acceptable.

Example:

```text id="k3yrm0"
Requirement:
Preserve all customer IDs.

Verification:
Compare submitted IDs against source dataset.

Result:
PASS if every source ID exists unchanged.
FAIL if any ID is missing or modified.
```

Another:

```text id="zv5h2m"
Requirement:
Remove duplicate records.

Verification:
Run deterministic duplicate detection.

Result:
PASS if duplicate rate <= defined threshold.
```

The goal is to transform vague requirements into verifiable conditions.

---

# 3.11 Acceptance Policy

The contract contains:

```typescript id="3w7z6c"
type AcceptancePolicy = {
  deterministicChecks: DeterministicCheck[];

  semanticChecks: SemanticCheck[];

  requiredEvidence: EvidenceRequirement[];

  decisionPolicy: {
    passCondition: string;
    failCondition: string;
    uncertainCondition: string;
  };
};
```

The preferred hierarchy is:

```text id="q2f5ms"
Deterministic verification
        ↓
AI semantic verification where necessary
        ↓
Human review if uncertain
```

AI should not be used for something that a deterministic test can establish reliably.

---

# 3.12 PASS / FAIL / UNCERTAIN

Every verification policy must allow three outcomes:

```text id="4n1y6z"
PASS
FAIL
UNCERTAIN
```

### PASS

Evidence satisfies all required acceptance conditions.

Payment may proceed according to the payment policy.

### FAIL

One or more mandatory conditions are not satisfied.

Payment must not be released.

The provider may be allowed to correct the work.

### UNCERTAIN

The system cannot confidently determine whether the work satisfies the contract.

Payment must not automatically proceed.

The task enters a human-review or escalation path.

This prevents the system from turning AI uncertainty into financial loss.

---

# 3.13 Payment Policy

The contract defines the conditions under which payment can occur.

Example:

```text id="f4h7y0"
Payment amount:
$135

Payment condition:

IF
    required work is submitted
AND
    verification result = PASS
AND
    no unresolved dispute exists
THEN
    payment may be captured

OTHERWISE
    payment must not be captured
```

This is not merely descriptive text.

The backend should represent the conditions in machine-readable form.

---

# 3.14 Authority Policy

The Work Contract must explicitly define what the agent is allowed to do.

Example:

```typescript id="t4v2ax"
type AuthorityPolicy = {
  maxSpend: Money;

  allowedCurrencies: string[];

  maySelectProvider: boolean;

  mayNegotiate: boolean;

  maxNegotiationRounds: number;

  mayChangeScope: boolean;

  mayExtendDeadline: boolean;

  requiresHumanApprovalAbove?: Money;
};
```

For example:

```text id="6qf5z0"
Maximum spend: $150
Maximum deadline: October 13
Scope changes: prohibited
Budget increases: prohibited
Provider selection: allowed
Negotiation: allowed
```

This gives the agent autonomy **inside a bounded authority envelope**.

---

# 3.15 The AI Authority Model

The system's philosophy is:

> **AI has intelligence, but not unrestricted authority.**

The contract defines the authority boundary.

```text id="h7j0qt"
             AI Agent
                │
        proposes / acts
                │
                ▼
         Authority Policy
                │
       ┌────────┴────────┐
       │                 │
    ALLOWED            DENIED
       │                 │
       ▼                 ▼
   Continue          Human Review /
                     Stop
```

This distinction becomes increasingly important once the system begins moving real money.

---

# 3.16 Budget Is a Ceiling, Not an Obligation

A $150 budget does not mean:

> “Pay $150.”

It means:

> “The agent may not commit more than $150 unless the user explicitly changes the authorization.”

For example:

```text id="j5l1kd"
Contract budget:
$150

Negotiated price:
$120
```

The commercial agreement should be $120.

The system does not owe the provider $150 merely because that was the maximum budget.

---

# 3.17 Deadline Semantics

The contract should contain an exact canonical deadline.

Example:

```text id="1w6kzn"
2026-10-13T12:00:00Z
```

The user-facing UI should render this in the user's timezone.

The backend uses the canonical timestamp.

The provider receives an unambiguous deadline.

---

# 3.18 Amendment Policy

An active contract must not silently change.

If a provider says:

> “I can do this, but I need $185 instead of $150.”

the negotiation component cannot simply update the contract.

Instead:

```text id="j2s6nz"
Provider requests change
        ↓
Amendment request
        ↓
Evaluate authority
        │
        ├── Within authority → potentially proceed
        │
        └── Outside authority → user approval
```

An amendment creates a new contract version.

Example:

```text id="q1t0m7"
Contract v1
   ↓
Amendment proposed
   ↓
Contract v2
```

The original remains preserved.

---

# 3.19 Contract Hash

The active contract should have a canonical representation.

That representation is hashed, for example using SHA-256.

Conceptually:

```text id="9y4xqs"
Canonical Contract JSON
        ↓
SHA-256
        ↓
contract_hash
```

Example:

```text id="q0y9gn"
contract_hash =
8d2e...a91f
```

The hash is stored with downstream economic records.

This means a payment or verification record can state:

> “This decision was made against contract version 1 with hash X.”

This is extremely useful for auditability.

---

# 3.20 Canonicalization

The hash must be generated from a deterministic representation.

The system must ensure:

- stable property ordering
- normalized values
- consistent number representation
- consistent timestamps
- no transient fields
- no database-specific metadata

Otherwise, the same logical contract could produce different hashes.

Conceptually:

```text id="a5q8ph"
Contract Object
      ↓
Canonical Serializer
      ↓
Canonical JSON
      ↓
SHA-256
      ↓
Contract Hash
```

---

# 3.21 Contract Lifecycle

The contract lifecycle is:

```text id="c1c7x5"
DRAFT
  ↓
AWAITING_APPROVAL
  ↓
ACTIVE
  ↓
WORK_IN_PROGRESS
  ↓
SUBMITTED
  ↓
VERIFICATION
  ↓
COMPLETED
```

Additional states:

```text id="x2m4cz"
CANCELLED
EXPIRED
DISPUTED
```

The contract compiler primarily owns:

```text id="j8s7tm"
Specification
    ↓
DRAFT
    ↓
AWAITING_APPROVAL
    ↓
ACTIVE
```

Later components own execution states.

---

# 3.22 Contract Approval Is a Real Product Interaction

The user should explicitly approve the contract before the system gains permission to proceed with economic execution.

This is a major trust boundary.

The screen should not feel like a generic “Terms & Conditions” checkbox.

It should feel like:

> **“Here is exactly what your AI is about to buy.”**

---

# 3.23 Contract Review UX

Recommended layout:

```text id="qk3rj9"
┌──────────────────────────────────────────────────────────────┐
│ ← Task                                                      │
│                                                              │
│ Review your work agreement                                   │
│                                                              │
│ Your agent is ready to find someone to perform this work.   │
│ Review the terms before you approve.                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ WHAT WILL BE DONE                                            │
│                                                              │
│ Clean the customer dataset and prepare it for CRM import.   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ REQUIREMENTS                                                 │
│                                                              │
│ ✓ Remove duplicate records                                  │
│ ✓ Correct malformed email addresses                         │
│ ✓ Preserve customer IDs                                     │
│ ✓ Do not delete incomplete records                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ DEADLINE                                                     │
│                                                              │
│ October 13, 2026 · 12:00 PM                                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ BUDGET                                                       │
│                                                              │
│ Maximum: $150                                                │
│                                                              │
│ The agent cannot spend more without your approval.          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PAYMENT                                                      │
│                                                              │
│ Payment is released only after the submitted work passes    │
│ the agreed verification checks.                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ YOUR AGENT CAN                                               │
│                                                              │
│ ✓ Find a suitable provider                                  │
│ ✓ Negotiate within the approved limits                      │
│ ✓ Authorize payment up to the approved amount               │
│ ✓ Request corrections if work fails verification            │
│                                                              │
│ YOUR AGENT CANNOT                                            │
│                                                              │
│ ✕ Increase the budget                                       │
│ ✕ Change the requirements                                   │
│ ✕ Pay for failed work                                      │
│ ✕ Spend outside this task                                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [ Edit ]                         [ Approve & Let AI Hire ]   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

This screen should be one of the strongest visual moments in the application.

---

# 3.24 Contract Readability

The contract should have two representations.

### Human representation

Designed for the user.

Plain language.

Easy to scan.

### Machine representation

Designed for the backend.

Structured and deterministic.

For example:

```text id="5r0hzg"
Human:

“Payment is released only after the submitted dataset
passes all required checks.”

Machine:

payment.capture.allowed_if = [
    verification.status == PASS,
    dispute.status == NONE
]
```

These must represent the same underlying policy.

The human version should be generated from the authoritative structured representation where possible rather than being a completely separate manually maintained text.

---

# 3.25 Contract Editing

Before activation, the user may edit the contract.

For example:

```text id="b6m7yx"
Maximum budget
$150 → $175
```

or:

```text id="2m0l3q"
Deadline
Tomorrow → Friday
```

However, editing should not directly mutate the existing specification.

The system should treat the change as a new version of the intended agreement.

Conceptually:

```text id="4u4p84"
Specification v2
      ↓
Contract Draft v1
      ↓
User edits
      ↓
Contract Draft v2
      ↓
Approval
```

Once activated, that version becomes immutable.

---

# 3.26 Approval Action

The primary action is:

> **Approve & Let AI Hire**

This action is more informative than simply:

> Approve

because it communicates the consequence.

The user is authorizing the next stage of autonomy.

The backend should record:

```typescript id="c7e4y0"
type ContractApproval = {
  contractId: string;
  contractVersion: number;
  userId: string;
  approvedAt: string;
  contractHash: string;
};
```

The approval must be associated with the exact version and hash.

---

# 3.27 What Approval Means

Approval does not mean:

> “Pay the provider now.”

It means:

> **“I authorize the system to proceed with the defined work and economic boundaries.”**

This distinction is critical.

After approval:

```text id="g3f6yh"
Contract ACTIVE
```

The system can then:

- discover providers
- negotiate within limits
- create a commercial agreement
- proceed toward payment authorization

But payment still requires its own deterministic authorization path.

---

# 3.28 Approval Security

The approval endpoint must verify:

- authenticated user
- task ownership
- contract ownership
- contract status
- contract version
- contract hash
- specification validity
- no unresolved blocking clarification
- no expired deadline
- valid budget

The client cannot simply send:

```json id="7qj4e2"
{
  "approved": true
}
```

and cause the system to activate an arbitrary contract.

The backend must determine which contract is being approved.

---

# 3.29 Approval API

Conceptually:

```http id="z7m2c8"
POST /api/tasks/:taskId/contracts/:contractId/approve
```

The server performs:

```text id="2f4g3x"
Authenticate
     ↓
Authorize
     ↓
Load contract
     ↓
Verify version/status
     ↓
Validate contract
     ↓
Record approval
     ↓
Transition contract → ACTIVE
     ↓
Emit CONTRACT_ACTIVATED
```

---

# 3.30 Contract Activation Event

On activation:

```typescript id="8u5qzv"
{
  "type": "CONTRACT_ACTIVATED",
  "taskId": "task_123",
  "contractId": "contract_456",
  "contractVersion": 1,
  "contractHash": "8d2e...",
  "userId": "user_123",
  "timestamp": "..."
}
```

Downstream components can now begin.

For example:

```text id="9c1k7w"
CONTRACT_ACTIVATED
        │
        ├── Provider Discovery
        ├── Task Activity
        └── Notification
```

---

# 3.31 Contract Data Model

Conceptually:

```text id="0q2u6c"
work_contracts
────────────────────────────────────────
id
task_id
version
status
objective
deadline
budget_amount_minor
budget_currency
specification_version
contract_hash
created_at
activated_at
```

Requirements:

```text id="2j4v1m"
contract_requirements
────────────────────────────────────────
id
contract_id
description
source
source_reference
verification_method
mandatory
```

Scope:

```text id="1t8g7c"
contract_scope_items
────────────────────────────────────────
id
contract_id
type
description
```

Acceptance:

```text id="0s6p5e"
contract_acceptance_rules
────────────────────────────────────────
id
contract_id
rule_type
configuration
mandatory
```

Authority:

```text id="1p4n9k"
contract_authority
────────────────────────────────────────
contract_id
max_spend_minor
currency
max_negotiation_rounds
scope_changes_allowed
deadline_extension_allowed
approval_threshold_minor
```

---

# 3.32 Contract Versioning

An active contract is immutable.

If something needs to change:

```text id="5f3j7d"
Contract v1
     │
     ▼
Amendment Request
     │
     ▼
Contract v2
     │
     ▼
New Approval
```

The system must never modify:

```text id="m6l2hj"
ACTIVE CONTRACT v1
```

in place.

This protects the integrity of:

- provider obligations
- verification
- payment
- disputes
- audit history

---

# 3.33 Dispute Implications

A dispute later may ask:

> “What exactly did the provider agree to?”

The system must be able to retrieve:

- contract version
- contract hash
- requirements
- acceptance criteria
- commercial agreement
- submitted work
- verification result
- payment decision

The contract therefore becomes the legal/operational reference point of the transaction, even if the hackathon MVP does not attempt to create a formal legal contract.

---

# 3.34 Contract and Provider Selection

Provider discovery must consume the active contract.

It should not consume:

```text id="r0t3g7"
original user request
```

directly.

Nor should it independently reinterpret the task.

The chain is:

```text id="4v0m5w"
Task
 ↓
Work Specification
 ↓
Active Work Contract
 ↓
Provider Discovery
```

This prevents different components from developing different interpretations of the same work.

---

# 3.35 Contract and Verification

The verifier must evaluate the deliverable against:

```text id="0t9v5a"
Active Contract
```

not:

```text id="1m5x8p"
Provider profile
```

not:

```text id="5q9g3a"
LLM's current interpretation
```

and not:

```text id="0j8s2r"
original request alone
```

The contract is the authoritative acceptance definition.

---

# 3.36 Contract and Payment

The payment service must reference:

- contract ID
- contract version
- contract hash
- commercial agreement
- verification result

Therefore a payment can be traced back to the exact terms under which it became payable.

Conceptually:

```text id="2g6r3h"
Payment
   │
   ├── Commercial Agreement
   │       │
   │       └── Contract v1
   │               │
   │               └── Specification v2
   │                       │
   │                       └── Original Task
```

---

# 3.37 Failure Handling

### Specification invalid

Contract compilation stops.

User sees:

> “I need one more detail before I can create the work agreement.”

### Contract generation failure

The task remains safe.

No economic action occurs.

### Contract validation failure

The contract is not presented for approval.

### User rejects contract

Contract remains unactivated.

The user may edit or cancel.

### User changes requirements

A new specification/contract version is generated.

### Deadline expires before approval

The contract becomes invalid and must be regenerated.

---

# 3.38 UX States

The contract screen needs explicit states.

### Preparing

```text
Creating your work agreement...
```

### Ready for review

```text
Your work agreement is ready.
```

### Needs correction

```text
We found an issue with the proposed agreement.
```

### Awaiting approval

```text
Review and approve before the agent can proceed.
```

### Active

```text
Agreement active.
Your agent can now find and hire a provider within these limits.
```

### Replaced

```text
This agreement was replaced by a newer version.
```

---

# 3.39 Human Attention Model

The contract UI should visually distinguish:

### Confirmed

```text
✓ Confirmed
```

### Inferred but confirmed

```text
✓ Confirmed after clarification
```

### System-derived

```text
ℹ Derived from your uploaded file
```

The user should not be overloaded with technical provenance metadata, but important assumptions should be discoverable.

---

# 3.40 The Contract Should Feel Like a Safety Mechanism

The UX should make the contract feel protective rather than bureaucratic.

For example:

> **Your agent will stay within these limits.**

Then:

```text
Maximum spend       $150
Scope changes       Not allowed
Deadline            Oct 13
Payment             After verification
```

This communicates the product's central trust proposition:

> **The AI is autonomous, but bounded.**

---

# 3.41 Definition of Done

The Work Contract Compiler is complete when the system can:

### Compile

- convert a valid Work Specification into a structured contract
- define scope
- define requirements
- define constraints
- define acceptance rules
- define payment conditions
- define authority boundaries

### Protect

- reject unresolved material ambiguity
- prevent AI-only requirements from silently becoming binding
- make active contracts immutable
- version amendments
- hash canonical contract representations

### Approve

- present a human-readable contract
- allow user edits before activation
- record explicit approval
- bind approval to contract version and hash

### Integrate

- provide the active contract to provider discovery
- provide acceptance rules to verification
- provide payment conditions to payment orchestration
- preserve complete provenance

The final guarantee is:

> **Once a Work Contract becomes ACTIVE, the system has a single, versioned, auditable definition of what work is being purchased, what the provider must deliver, what the agent is authorized to do, and what conditions must be satisfied before payment can be released.**

The next component can now answer:

> **“Given this exact active contract, who is actually capable of performing it, and which eligible provider should the agent choose?”**