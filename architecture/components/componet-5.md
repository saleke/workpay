# Component 5 — Commercial Negotiation & Commitment

## 5.1 Purpose

Commercial Negotiation & Commitment converts a selected provider into a **mutually accepted commercial agreement**.

Its responsibility is:

> **Negotiate price and permitted commercial terms with the selected provider, enforce the authority boundaries defined by the active Work Contract, obtain explicit acceptance from both sides, and produce a signed-off Commercial Agreement that can safely proceed to payment authorization.**

The component sits between:

```text
Provider Selection
        ↓
Commercial Negotiation
        ↓
Commercial Agreement
        ↓
Payment Authorization
```

The key architectural distinction is:

> **The Work Contract defines what work must be performed. The Commercial Agreement defines the economic terms under which that work will be performed.**

---

# 5.2 Why This Needs to Be a Separate Component

Suppose the active contract says:

```text
Work:
Clean 5,000 customer records

Maximum budget:
$150

Deadline:
12 hours

Acceptance:
All required validation checks must pass
```

The provider might respond:

> “I can do this for $120, but I need 8 hours.”

That is potentially acceptable.

Another provider might say:

> “I can do it for $90, but I need 24 hours.”

That is not acceptable because it violates the deadline.

Another might say:

> “I can do it for $140, but I need the scope reduced.”

That is not simply a negotiation anymore. It is a **contract amendment**.

Therefore negotiation cannot be a free-form AI conversation.

It must operate inside a formal authority envelope.

---

# 5.3 Component Boundary

This component starts with:

```text
ACTIVE WORK CONTRACT
+
SELECTED PROVIDER
```

and ends with:

```text
ACCEPTED COMMERCIAL AGREEMENT
```

It must not:

- redefine the user's requirements
- silently modify the Work Contract
- select a different provider
- authorize PayPal
- capture payment
- verify deliverables
- decide whether work is complete

Its boundary is:

```text id="l7n8yz"
             ACTIVE WORK CONTRACT
                      │
                      │
             SELECTED PROVIDER
                      │
                      ▼
             ┌─────────────────┐
             │   NEGOTIATION   │
             └────────┬────────┘
                      │
             ┌────────┴────────┐
             │                 │
          ACCEPT            CHANGE
             │                 │
             ▼                 ▼
       COMMERCIAL         AMENDMENT
       AGREEMENT          WORKFLOW
             │
             ▼
       PAYMENT AUTH
```

---

# 5.4 The Core Principle

The most important rule in this component is:

> **The agent may negotiate within authority, but it may not expand its own authority.**

For example, if the user approved:

```text
Maximum spend: $150
Deadline: 12 hours
```

the agent can negotiate:

```text
$150 → $135
$150 → $120
```

and perhaps:

```text
12h → 10h
12h → 8h
```

But it cannot negotiate:

```text
$150 → $175
```

or:

```text
12h → 24h
```

unless the user's authority policy explicitly permits that.

---

# 5.5 Authority Comes From the Contract

The negotiation engine must not decide its own boundaries.

It reads the active Work Contract:

```typescript
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

The negotiation engine treats these values as **hard constraints**.

The LLM cannot override them through a prompt.

---

# 5.6 Negotiation Object

A negotiation is a persistent domain object.

```typescript
type Negotiation = {
  id: string;

  contractId: string;

  providerId: string;

  status:
    | "INITIATED"
    | "OFFER_SENT"
    | "COUNTEROFFER_RECEIVED"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED"
    | "CANCELLED";

  currentOfferId: string | null;

  roundCount: number;

  createdAt: string;

  updatedAt: string;
};
```

The negotiation should never be represented only as a chat transcript.

The transcript is communication.

The negotiation object is the authoritative business state.

---

# 5.7 Offers Are Immutable

Every commercial proposal should be represented as an immutable Offer.

```typescript
type Offer = {
  id: string;

  negotiationId: string;

  version: number;

  price: Money;

  deliveryDeadline: string;

  paymentTerms: PaymentTerms;

  conditions: OfferCondition[];

  submittedBy:
    | "BUYER_AGENT"
    | "PROVIDER";

  status:
    | "PENDING"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED"
    | "SUPERSEDED";

  createdAt: string;
};
```

If the provider changes:

```text
$140 → $130
```

the system does not mutate the old offer.

It creates:

```text
Offer v1
$140

Offer v2
$130
```

and marks v1 as superseded.

This gives the system a complete negotiation history.

---

# 5.8 Why Offers Must Be Immutable

Imagine a dispute six weeks later.

The provider claims:

> “I accepted $140.”

The system needs to know exactly what happened.

With immutable offers:

```text
Offer v1
$150
 ↓
Counteroffer v2
$140
 ↓
Counteroffer v3
$135
 ↓
Accepted v3
```

There is no ambiguity.

This also allows the activity timeline to tell the economic story.

---

# 5.9 Payment Terms

The commercial negotiation may determine more than price.

Possible payment terms include:

```text
FULL_ON_ACCEPTANCE
FULL_ON_VERIFICATION
MILESTONE_BASED
PARTIAL_UPFRONT
```

However, the contract's payment policy remains authoritative.

For example, if the Work Contract says:

> “Payment only after successful verification.”

the provider cannot negotiate:

> “Pay me 50% upfront.”

unless the contract authority explicitly permits such a change.

---

# 5.10 Commercial Terms vs Work Terms

This distinction must be enforced.

### Commercial terms

Potentially negotiable:

```text
price
delivery timing within permitted range
milestone structure
permitted payment schedule
```

### Work terms

Normally fixed:

```text
objective
mandatory requirements
acceptance criteria
required inputs
scope
quality thresholds
```

For example:

Provider:

> “I can do this for $100 if you remove duplicate detection.”

That is not merely a price negotiation.

It changes the work.

The system should classify it as:

```text
SCOPE_CHANGE_REQUEST
```

and route it to the amendment process.

---

# 5.11 Negotiation State Machine

The negotiation should have explicit state transitions.

```text
INITIATED
    ↓
OFFER_SENT
    ↓
COUNTEROFFER_RECEIVED
    ↓
OFFER_SENT
    ↓
...
    ↓
ACCEPTED
```

Alternative terminal states:

```text
REJECTED
EXPIRED
CANCELLED
```

A negotiation must not jump directly from:

```text
INITIATED
```

to:

```text
ACCEPTED
```

without a valid accepted offer.

---

# 5.12 Negotiation Rounds

The contract can impose a maximum number of rounds.

Example:

```text
maxNegotiationRounds = 3
```

Then:

```text
Round 1
Agent: $145

Round 2
Provider: $140

Round 3
Agent: $135

Accepted
```

If the provider continues:

```text
Provider: $132
```

the system may stop because the permitted negotiation rounds have been exhausted.

This prevents autonomous negotiation from becoming an uncontrolled loop.

---

# 5.13 Negotiation Strategy

The LLM can help formulate offers.

For example:

```text
Contract maximum:
$150

Provider requested:
$145

Historical provider rate:
$125–$140

Deadline:
8 hours

Agent strategy:
Attempt $135
Maximum acceptable:
$150
```

The model can decide:

> “Offer $135 and emphasize fast confirmation.”

But the model cannot decide:

> “I'll offer $180.”

The policy layer rejects that before it ever reaches the provider.

---

# 5.14 Recommended Agent Architecture

The negotiation agent should not have direct payment or database mutation authority.

Instead:

```text
Negotiation Agent
       │
       │ proposes
       ▼
Negotiation Policy Engine
       │
       ├── ALLOWED
       │
       └── DENIED
       │
       ▼
Negotiation Service
       │
       ▼
Provider
```

This repeats a core architectural principle across the product:

> **LLM proposes. Deterministic software disposes.**

---

# 5.15 Negotiation Proposal

Internally, the LLM can produce:

```typescript
type NegotiationProposal = {
  proposedPrice: Money;

  proposedDeadline: string;

  proposedPaymentTerms: PaymentTerms;

  rationale: string;

  requestedChanges?: RequestedChange[];
};
```

The proposal is not automatically sent.

It first enters validation.

---

# 5.16 Policy Validation

The system evaluates:

```typescript
validateOffer(
  proposal,
  contract,
  negotiationState
)
```

Potential checks:

```text
Price <= maximum authorized spend
Currency is allowed
Deadline <= authorized deadline
Payment terms are allowed
Negotiation round limit not exceeded
No mandatory requirement changed
No prohibited scope change
Provider is still active
Contract is still active
```

Only after all checks pass can the offer be sent.

---

# 5.17 Example

Contract:

```text
Maximum:
$150

Deadline:
12:00 PM

Maximum negotiation rounds:
3
```

Provider:

```text
$145
```

Agent proposes:

```text
$135
```

Policy engine:

```text
Price:
$135 <= $150 ✓

Deadline:
12:00 PM <= contract deadline ✓

Currency:
USD ✓

Round:
1 <= 3 ✓

Scope:
unchanged ✓
```

Result:

```text
ALLOWED
```

The provider receives the offer.

---

# 5.18 Invalid Proposal Example

LLM proposes:

```text
Price:
$175
```

Policy engine:

```text
$175 > $150
```

Result:

```text
DENIED
```

The provider never sees it.

The system records:

```text
Negotiation proposal denied:
PRICE_EXCEEDS_AUTHORITY
```

This is a critical security boundary.

---

# 5.19 Provider Counteroffers

Providers need the same protection.

Suppose the provider responds:

> “$160 and 24 hours.”

The system parses the counteroffer into structured data:

```text
price = $160
deadline = +24h
```

Then validates it against the contract.

Both fail.

The system can tell the negotiation agent:

```text
Provider counteroffer exceeds:
- maximum spend
- deadline
```

The agent can respond appropriately.

---

# 5.20 AI Should Not Negotiate Scope

Suppose the provider says:

> “I can do the work for $90 if I only process 3,000 records.”

The model might think this is a good deal.

But the system must recognize:

```text
5,000 records
        ↓
3,000 records
```

as a scope change.

That means:

```text
NEGOTIATION
     ↓
SCOPE CHANGE DETECTED
     ↓
AMENDMENT WORKFLOW
```

The negotiation cannot silently accept it.

---

# 5.21 Amendment Workflow

If a provider requests a change outside commercial authority:

```text
Provider Request
      ↓
Change Classification
      ↓
Commercial Change?
      │
      ├── Yes → validate negotiation
      │
      └── No
           ↓
       Contract Change
           ↓
      Amendment Workflow
```

An amendment creates a new contract version.

For example:

```text
Contract v1
$150 maximum
5,000 records

Provider requests:
4,000 records
$110

Contract v2
only if user approves
```

The original contract remains preserved.

---

# 5.22 User Approval for Amendments

If the agent lacks authority to modify the contract, the user sees:

```text
┌──────────────────────────────────────────────────────────────┐
│ Provider requested a change                                 │
│                                                              │
│ Current agreement                                            │
│ 5,000 records · $150 max                                    │
│                                                              │
│ Provider proposes                                            │
│ 4,000 records · $110                                        │
│                                                              │
│ This changes the work requirements.                          │
│ Your agent cannot approve this automatically.                │
│                                                              │
│ [ Reject ]                         [ Review Change ]          │
└──────────────────────────────────────────────────────────────┘
```

This is a major trust feature.

The system does not hide meaningful changes inside autonomous negotiation.

---

# 5.23 Provider Acceptance

An accepted offer must be explicit.

For example:

```text
Provider:
"I accept Offer #v3."
```

The system should convert this into a structured acceptance event:

```typescript
type OfferAcceptance = {
  offerId: string;

  acceptedBy: "PROVIDER";

  acceptedAt: string;

  providerId: string;
};
```

Likewise, the buyer-side agent's acceptance should be recorded.

---

# 5.24 Mutual Acceptance

The commercial agreement is created only when:

```text
Buyer acceptance
+
Provider acceptance
+
Valid contract
+
Valid offer
```

all exist.

Conceptually:

```text
Contract
   +
Accepted Offer
   +
Provider Acceptance
   +
Buyer/Agent Authority
   ↓
Commercial Agreement
```

---

# 5.25 Commercial Agreement

Once accepted:

```typescript
type CommercialAgreement = {
  id: string;

  contractId: string;

  providerId: string;

  acceptedOfferId: string;

  agreedPrice: Money;

  paymentTerms: PaymentTerms;

  deliveryDeadline: string;

  status:
    | "PENDING_AUTHORIZATION"
    | "AUTHORIZED"
    | "ACTIVE"
    | "COMPLETED"
    | "CANCELLED";

  agreementHash: string;

  createdAt: string;
};
```

This becomes the bridge between negotiation and payment.

---

# 5.26 Agreement Is the Economic Source of Truth

Once created, downstream payment logic should not ask:

> “What price did the LLM mention?”

It should ask:

> “What price is recorded in the active Commercial Agreement?”

For example:

```text
Commercial Agreement
Price = $135
```

The payment system uses `$135`.

Not:

```text
Original budget = $150
```

and not:

```text
LLM memory = $135
```

---

# 5.27 Agreement Hash

The final agreement should be canonicalized and hashed.

Conceptually:

```text
Work Contract v1
+
Accepted Offer v3
        ↓
Canonical representation
        ↓
SHA-256
        ↓
Agreement Hash
```

Example:

```text
agreement_hash =
9d8e...f21
```

The hash is persisted with the agreement and later attached to payment operations.

This creates a strong chain:

```text
Contract
   ↓
Commercial Agreement
   ↓
Payment
   ↓
Verification
```

---

# 5.28 Why Hash the Agreement?

Imagine a dispute:

> “Was the provider paid for $135 or $150?”

The system can identify:

```text
Contract hash
Agreement hash
PayPal transaction ID
```

and reconstruct exactly what economic terms were in effect.

The hash is not a blockchain.

It is simply a compact integrity fingerprint.

---

# 5.29 Payment Must Not Start During Negotiation

This is an important boundary.

During negotiation:

```text
No PayPal authorization
No capture
No refund
```

The system is only establishing terms.

Only after:

```text
Commercial Agreement
```

does the payment component become eligible to act.

Therefore:

```text
Negotiation
   ↓
Accepted Agreement
   ↓
Payment Authorization
```

not:

```text
Negotiation
   ↓
Maybe authorize PayPal
   ↓
Continue negotiating
```

---

# 5.30 Negotiation UI

The buyer should not necessarily see every AI thought.

The product should expose the meaningful economic state.

Example:

```text
┌──────────────────────────────────────────────────────────────┐
│ Negotiating with Provider C                                  │
│                                                              │
│ Your limit                                                  │
│ Maximum: $150                                                │
│ Deadline: 12 hours                                          │
│                                                              │
│ Provider's initial offer                                    │
│ $145 · delivery in 8 hours                                  │
│                                                              │
│ Agent response                                               │
│ $135 · delivery in 8 hours                                  │
│                                                              │
│ Status                                                       │
│ Waiting for provider                                        │
│                                                              │
│ The agent is negotiating within your approved limits.       │
└──────────────────────────────────────────────────────────────┘
```

This communicates autonomy without turning the product into a chatbot.

---

# 5.31 Negotiation Completed UI

When accepted:

```text
┌──────────────────────────────────────────────────────────────┐
│ Agreement reached                                            │
│                                                              │
│ Provider: Provider C                                         │
│ Price: $135                                                  │
│ Delivery: Within 8 hours                                    │
│ Payment: Released after successful verification              │
│                                                              │
│ Your original maximum: $150                                 │
│ Negotiated price: $135                                      │
│                                                              │
│ ✓ Provider accepted                                          │
│ ✓ Terms within your authority                               │
│ ✓ Commercial agreement created                              │
│                                                              │
│ Next: Payment authorization                                  │
└──────────────────────────────────────────────────────────────┘
```

This is a very strong UX moment.

The user sees:

> **The agent successfully negotiated a better economic outcome while respecting my boundaries.**

---

# 5.32 Negotiation Failure UI

If the provider rejects the final offer:

```text
┌──────────────────────────────────────────────────────────────┐
│ Negotiation ended                                            │
│                                                              │
│ Provider C could not accept terms within your approved      │
│ budget and deadline.                                         │
│                                                              │
│ Your limit: $150                                             │
│ Provider's minimum: $175                                     │
│                                                              │
│ No payment has been made.                                    │
│                                                              │
│ [Try another provider] [Increase budget] [Cancel task]       │
└──────────────────────────────────────────────────────────────┘
```

Again, the system must never silently increase the budget.

---

# 5.33 Autonomous vs Human-Controlled Negotiation

The Work Contract should control how much autonomy is permitted.

Possible modes:

```text
FULL_AUTONOMOUS

NEGOTIATE_WITHIN_LIMITS

REQUIRES_APPROVAL
```

For example:

```text
User setting:

Maximum:
$150

Automatically accept:
≤ $135

Ask me:
$135–$150

Never exceed:
$150
```

This gives the user a much more expressive authority model than simply:

> “AI on/off.”

---

# 5.34 Example Authority Envelope

```typescript
type NegotiationAuthority = {
  maximumPrice: Money;

  preferredPrice?: Money;

  automaticAcceptanceLimit?: Money;

  maximumRounds: number;

  maximumDeadline: string;

  allowedPaymentTerms: string[];

  allowMilestones: boolean;

  allowScopeChanges: boolean;
};
```

The key is that:

```text
maximumPrice
```

is a hard ceiling.

The LLM cannot reinterpret it.

---

# 5.35 Negotiation Strategy Should Be Replaceable

The system should not tightly couple negotiation logic to one model.

Conceptually:

```typescript
interface NegotiationStrategy {
  proposeNextOffer(
    context: NegotiationContext
  ): Promise<NegotiationProposal>;
}
```

Possible implementations:

```text
RuleBasedNegotiationStrategy
LLMNegotiationStrategy
HybridNegotiationStrategy
```

For the hackathon, a hybrid strategy is ideal.

For example:

```text
Deterministic constraints
+
LLM proposal generation
+
Deterministic validation
```

---

# 5.36 Why Hybrid Is Better Than Pure LLM

Pure LLM negotiation:

```text
LLM
 ↓
Provider
```

is risky.

Pure rules:

```text
if price > X
reject
```

are safe but not very intelligent.

Hybrid:

```text
LLM
 ↓
proposal
 ↓
policy engine
 ↓
provider
```

gives:

- intelligence
- creativity
- safety
- explainability

This is exactly the kind of architecture that demonstrates meaningful AI use without pretending the LLM is a secure financial authority.

---

# 5.37 Negotiation Events

Persist domain events such as:

```text
NEGOTIATION_STARTED
OFFER_CREATED
OFFER_SENT
COUNTEROFFER_RECEIVED
OFFER_REJECTED
OFFER_EXPIRED
OFFER_ACCEPTED
SCOPE_CHANGE_REQUESTED
NEGOTIATION_COMPLETED
NEGOTIATION_FAILED
COMMERCIAL_AGREEMENT_CREATED
```

These events feed:

- task timeline
- audit log
- analytics
- reputation calculations
- debugging
- demo UI

---

# 5.38 Negotiation Audit Trail

Example:

```text
10:04
Provider C selected.

10:05
Provider requested $145.

10:05
Agent offered $135.

10:06
Provider accepted $135.

10:06
Commercial agreement created.

10:06
Agreement hash recorded.

10:07
Payment authorization requested.
```

This is significantly more compelling than showing a generic AI chat transcript.

---

# 5.39 Database Structure

The modular monolith can contain:

```text
negotiations
offers
offer_conditions
offer_acceptances
commercial_agreements
commercial_agreement_terms
negotiation_events
```

The relationship is:

```text
Contract
   │
   └── Negotiation
          │
          ├── Offer v1
          ├── Offer v2
          └── Offer v3
                   │
                   ▼
             Accepted Offer
                   │
                   ▼
        Commercial Agreement
```

---

# 5.40 Concurrency and Race Conditions

Negotiation is stateful.

Imagine:

```text
Provider sends $130
```

while the agent simultaneously sends:

```text
$135
```

The system must prevent both from becoming the accepted offer.

Therefore negotiation state changes should use transactional concurrency control.

Conceptually:

```text
Current Offer Version = 4

Agent tries update based on version 4
Provider simultaneously updates version 4

Only one succeeds.

The other must reload current state.
```

This avoids conflicting commercial states.

---

# 5.41 Idempotency

Network retries must not create duplicate offers.

For example:

```text
POST /negotiations/:id/offers
```

should support an idempotency key.

If the same request is accidentally retried:

```text
same idempotency key
```

the system returns the existing offer instead of creating another economic proposal.

This becomes particularly important when external providers or future communication channels are involved.

---

# 5.42 Provider Communication Boundary

The negotiation service should own communication with the provider.

The LLM should not directly control:

```text
email
chat
HTTP requests
payment APIs
```

Instead:

```text
Negotiation Agent
       ↓
Structured Offer
       ↓
Negotiation Service
       ↓
Provider Interface
```

This keeps communication and authority separate.

---

# 5.43 Security Model

The security architecture is:

```text
                  LLM
                   │
              proposal only
                   ▼
           Policy Validation
                   │
             ALLOWED?
             /       \
           NO         YES
           │           │
          STOP         ▼
                  Negotiation Service
                         │
                         ▼
                      Provider
```

The model cannot:

- change budget
- change contract scope
- authorize payment
- access PayPal credentials
- create a financial agreement outside policy

---

# 5.44 Critical Invariants

The component should enforce these invariants.

### Invariant 1

Every accepted offer must belong to the current active contract.

### Invariant 2

The accepted offer must not violate the contract's authority envelope.

### Invariant 3

An offer is immutable after creation.

### Invariant 4

A negotiation cannot exceed its permitted round count.

### Invariant 5

A scope change cannot be silently treated as a commercial change.

### Invariant 6

A Commercial Agreement can only exist from an explicitly accepted valid offer.

### Invariant 7

A Commercial Agreement must reference the exact contract version it was negotiated under.

### Invariant 8

No payment action occurs merely because an offer was created or accepted.

---

# 5.45 End-to-End Flow

The complete component flow is:

```text
ACTIVE CONTRACT
      │
      ▼
SELECTED PROVIDER
      │
      ▼
Create Negotiation
      │
      ▼
Load Authority Policy
      │
      ▼
Generate Offer
      │
      ▼
Validate Offer
      │
      ├── DENIED → regenerate / stop
      │
      ▼
Send Offer
      │
      ▼
Provider Responds
      │
      ▼
Parse Response
      │
      ├── Scope Change → Amendment Workflow
      │
      └── Commercial Counteroffer
                 │
                 ▼
          Validate Counteroffer
                 │
                 ▼
            Continue Loop
                 │
                 ▼
          Mutual Acceptance
                 │
                 ▼
       Create Commercial Agreement
                 │
                 ▼
             Hash Agreement
                 │
                 ▼
       PAYMENT AUTHORIZATION
```

---

# 5.46 User Experience Across the Component

The user should experience this as a progression, not as an engineering workflow.

### State 1

```text
Finding provider...
```

### State 2

```text
Provider found.

Negotiating within your approved limits...
```

### State 3

```text
Negotiated price:
$135

Your maximum:
$150
```

### State 4

```text
Agreement reached.

Next:
Payment authorization
```

The UI should consistently communicate:

```text
What happened?
Why?
What can the agent do?
What can't it do?
What happens next?
```

---

# 5.47 Definition of Done

Commercial Negotiation & Commitment is complete when the system can:

### Negotiate

- initiate negotiation with selected provider
- create structured offers
- receive counteroffers
- maintain negotiation rounds
- terminate negotiation safely

### Enforce authority

- enforce maximum spend
- enforce deadline
- enforce currency
- enforce payment terms
- enforce negotiation round limits
- prevent unauthorized scope changes

### Use AI safely

- allow AI to formulate proposals
- validate every AI proposal deterministically
- prevent the model from exceeding authority
- fall back to deterministic negotiation if necessary

### Establish agreement

- record provider acceptance
- record buyer/agent acceptance
- create Commercial Agreement
- snapshot the accepted terms
- generate agreement hash

### Preserve auditability

- keep immutable offers
- preserve negotiation history
- record policy decisions
- record contract version/hash
- emit negotiation events

### Protect money

- never initiate PayPal payment merely because negotiation started
- never initiate payment from an invalid or unauthorized offer
- pass only the finalized Commercial Agreement to the payment component

---

# 5.48 Final Architectural Guarantee

At the end of this component, the system should be able to guarantee:

> **The provider and the agent have reached an explicit commercial agreement whose price, timing, payment terms, and other economic conditions are within the authority granted by the user's active Work Contract. Every accepted term is versioned, immutable, auditable, and ready to be handed to the payment system without allowing the AI to expand its own authority.**

This creates the critical transition:

```text
WHAT SHOULD BE DONE?
        ↓
   Work Contract
        ↓
WHO SHOULD DO IT?
        ↓
 Provider Selection
        ↓
UNDER WHAT TERMS?
        ↓
Commercial Agreement
        ↓
HOW DOES MONEY MOVE?
        ↓
Payment Authorization
```