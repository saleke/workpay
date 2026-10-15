# Component 16 — Frontend & UX Architecture

## 1. Responsibility

Component 16 defines how users interact with WorkPay through the web application.

Its responsibility is to turn the system's underlying workflow into a clear, trustworthy, and usable experience:

> **Intent → Contract → Hiring → Payment Authorization → Work → Verification → Settlement**

The frontend does not own business state, payment authority, verification decisions, or workflow rules.

It presents system state, collects user intent and approvals, initiates authorized API operations, and gives users visibility into what the agent and other system components are doing.

The frontend is therefore a **client of the WorkPay application API**, not another source of truth.

---

# 2. Architectural Boundary

The frontend sits above Component 15:

```text
┌──────────────────────────────────────────┐
│              WorkPay Web App             │
│                                          │
│  Buyer UI             Provider UI        │
│  ├─ Tasks             ├─ Available Work  │
│  ├─ Activity          ├─ My Work         │
│  ├─ Payments          ├─ Submissions     │
│  └─ Settings          └─ Payments        │
│                                          │
└─────────────────┬────────────────────────┘
                  │
             HTTPS / SSE
                  │
┌─────────────────▼────────────────────────┐
│        Component 15 — Application API    │
└──────────────────────────────────────────┘
```

The browser may temporarily hold UI state, but authoritative state remains in the backend.

The frontend must never be treated as authoritative for:

- user identity
- permissions
- task ownership
- contract contents
- budget
- payment amount
- payment state
- verification result
- provider selection
- agent authority
- approval state

A malicious user must be unable to change business outcomes by manipulating frontend requests or browser state.

---

# 3. UX Principle

WorkPay should not feel like a collection of backend modules.

The user should experience one coherent workflow:

> **“I give the agent a job, understand what it plans to do, approve its authority, watch it execute, and see exactly why money was or was not released.”**

The interface should therefore organize itself around the **Task**, because the task is the user's primary unit of work.

The task workspace becomes the central product surface.

---

# 4. Application Structure

The buyer-facing application should have a small navigation structure:

```text
WorkPay
│
├── New Task
├── My Tasks
├── Activity
├── Payments
└── Settings
```

The provider-facing experience can use the same application and authentication system but expose a different navigation based on role:

```text
Provider
│
├── Available Work
├── My Work
├── Payments
└── Profile
```

There should not be separate frontend applications unless implementation requirements later justify them.

Role-specific access is enforced by the backend; the frontend merely adapts the available experience.

---

# 5. Global Application Shell

The application shell provides:

- authenticated user identity
- navigation
- current role
- notifications/activity indicator
- account/settings access
- connection/realtime status where useful

The shell should remain visually quiet.

WorkPay's important information is inside the task workflow, so navigation should not compete with the task state.

A task should be reachable directly through an opaque task ID:

```text
/tasks/{taskId}
```

The frontend must never assume that knowing a task ID grants access to it.

---

# 6. New Task Experience

The primary buyer action is **New Task**.

The initial experience should be intentionally simple.

Example:

```text
Create a task

What do you need done?

[ Clean 5,000 customer records and remove duplicates... ]

Budget
[ $150 ]

Deadline
[ Tomorrow, 6:00 PM ]

Files
[ Upload dataset ]

             [Continue]
```

The user should not initially be forced to understand:

- work specifications
- contracts
- provider capabilities
- verification pipelines
- payment authorization

Those are system concepts that become visible as the agent turns the request into an executable task.

After submission:

```text
Your task is being prepared...

AI is analyzing your request
        ↓
Work requirements
        ↓
Acceptance criteria
        ↓
Possible providers
```

The frontend receives the resulting state from the API rather than attempting to perform this processing itself.

---

# 7. Task Workspace

The task workspace is the most important screen in the product.

A simplified structure:

```text
┌─────────────────────────────────────────────────┐
│ Clean 5,000 Customer Records          IN PROGRESS│
├─────────────────────────────────────────────────┤
│ Objective                                       │
│ Clean and normalize the supplied customer data │
│                                                 │
│ Budget          Deadline          Provider      │
│ $150            24 hours          DataWorks     │
│                                                 │
├─────────────────────────────────────────────────┤
│ Work Contract                                   │
│ Requirements                                    │
│ Acceptance                                     │
│ Payment Conditions                              │
├─────────────────────────────────────────────────┤
│ Activity                                        │
│ ✓ Task created                                  │
│ ✓ Contract approved                             │
│ ✓ Provider selected                             │
│ ✓ $135 authorized                               │
│ → Work submitted                                │
│ → Verification running                          │
└─────────────────────────────────────────────────┘
```

The workspace should answer five questions immediately:

1. **What is the agent doing?**
2. **Who is doing the work?**
3. **How much money is involved?**
4. **What must happen before payment is released?**
5. **What is happening right now?**

---

# 8. Task State Presentation

Backend state should be translated into understandable product states.

For example:

```text
CREATED
Preparing task

REQUIRES_CLARIFICATION
Needs your input

CONTRACT_PENDING_APPROVAL
Ready for your approval

NEGOTIATING
Finding the best provider and terms

AUTHORIZED
Work funded / payment authorized

IN_PROGRESS
Provider is working

VERIFICATION
Checking submitted work

REVISION_REQUESTED
Work did not meet requirements

HUMAN_REVIEW
Needs your attention

COMPLETED
Work accepted and payment settled

DISPUTED
Payment/work is under review

CANCELLED
Task cancelled
```

The frontend should not expose raw internal state names unless useful for debugging.

---

# 9. Contract Review Experience

The contract is where the user grants the agent meaningful authority.

It should therefore receive a dedicated, explicit review surface.

Example:

```text
Before WorkPay hires this provider

WHAT WILL BE DONE
Clean 5,000 customer records.

REQUIREMENTS
• Preserve customer IDs
• Normalize names
• Normalize emails
• Remove duplicates
• No required fields may be lost

ACCEPTANCE
• Schema must remain valid
• Duplicate rate must be <1%
• All 5,000 records accounted for

COMMERCIAL TERMS
Provider: DataWorks
Price: $135
Deadline: 8 hours

PAYMENT
$135 is authorized now.
Payment is captured only if verification passes.

YOUR AUTHORITY
Maximum spend: $150
Currency: USD

[Approve & Let AI Hire]
[Request Changes]
```

This is an important product distinction:

**Approval is not merely “Start.”**

It represents authorization for a specific contract version.

The UI should make that understandable.

---

# 10. Contract Version Visibility

Once approved, the frontend should clearly communicate that the user approved a specific version.

For example:

```text
Contract v3
Approved
Contract ID: ...
```

If the contract materially changes:

```text
Contract changed

The provider proposed a new deadline and price.

Previous:
$135 / 8 hours

New:
$125 / 10 hours

Your approval is required.

[Review Changes]
```

The frontend should never silently represent a new contract as the old one.

This corresponds directly to the versioning and hash guarantees established in Components 3, 5, 9, and 14.

---

# 11. Provider Selection Experience

When a provider is selected, the user should be able to understand why.

Example:

```text
Provider selected

DataWorks

$135
Estimated completion: 8 hours
Historical acceptance: 97%

Why selected?
✓ Meets all required capabilities
✓ Within budget
✓ Highest expected completion probability
✓ Faster than alternatives

Alternatives

Provider B
$110 · 12 hours · 89% acceptance

Provider C
$145 · 6 hours · 95% acceptance
```

The system should distinguish:

- **what the agent chose**
- **why it chose it**
- **what alternatives existed**

This improves trust without exposing internal chain-of-thought.

The UI should show decision factors and outcomes, not hidden reasoning traces.

---

# 12. Negotiation Experience

Negotiation should be visible but not overwhelming.

Instead of exposing every internal agent message, show commercially meaningful events:

```text
Negotiation

Initial offer
$150 · 10 hours

Provider counteroffer
$140 · 9 hours

Agent response
$135 · 8 hours

Agreement reached
$135 · 8 hours
```

The user should understand the economic result without being forced to inspect the agent's internal reasoning.

If negotiation reaches an authority boundary:

```text
The provider requested $165.

Your maximum authorized spend is $150.

The agent cannot accept this offer.

[Increase Budget]
[Choose Another Provider]
```

This demonstrates one of WorkPay's central principles:

> **The agent can negotiate, but it cannot expand its own authority.**

---

# 13. Payment UX

Payment status should be visible directly inside the task.

Example:

```text
Payment

Amount          $135
Status          Authorized
Release         Waiting for verification

Payment condition:
Work must pass all required acceptance checks.

[View Payment Details]
```

After successful verification:

```text
Payment

$135
CAPTURED

✓ Work verified
✓ Payment policy passed
✓ PayPal capture completed
```

If verification fails:

```text
Payment

$135
NOT RELEASED

Verification failed.

Reason:
Duplicate rate: 7.2%
Required: <1%

Provider has been asked to revise the submission.
```

The interface should avoid ambiguous phrases such as “payment processing” when the actual economic state is known.

Users should be able to distinguish:

- proposed
- authorized
- awaiting verification
- capture eligible
- captured
- failed
- refunded
- disputed

---

# 14. Activity Timeline

The activity timeline provides the user's primary view into agentic execution.

Example:

```text
Today

10:02
You created the task.

10:03
AI created Work Contract v1.

10:03
You approved Contract v1.

10:04
Provider selected: DataWorks.

10:05
$135 authorized through PayPal.

10:07
Provider submitted work v1.

10:08
Verification failed.
Duplicate rate: 7.2%.

10:09
Revision requested.

10:12
Provider submitted work v2.

10:13
Verification passed.

10:13
$135 captured through PayPal.
```

Every meaningful event should be backed by the event architecture from Component 12.

The frontend is therefore rendering **facts**, rather than inventing its own activity history.

---

# 15. Verification Experience

Verification should be understandable to a non-technical buyer.

Example:

```text
Verification passed

5 / 5 requirements satisfied

✓ All records accounted for
✓ IDs preserved
✓ Schema valid
✓ Email normalization valid
✓ Duplicate rate: 0.4% (<1%)

Payment is eligible for release.
```

For failure:

```text
Verification failed

1 requirement failed

✓ IDs preserved
✓ Schema valid
✕ Duplicate rate: 7.2%
  Required: <1%
✓ Required fields present

Payment has not been released.
```

For uncertainty:

```text
Verification requires review

The system could not confidently determine whether
the submitted output satisfies the terminology requirement.

Payment remains blocked.

[Review Submission]
```

The distinction between **FAIL** and **UNCERTAIN** must be visible.

---

# 16. Human Review Experience

When automation cannot safely resolve an issue, the UI should change from an informational view to an action-oriented review surface.

Example:

```text
Review required

Reason:
Verification could not determine whether the submission
satisfies the terminology requirement.

Evidence
• Contract requirement
• Provider submission
• Verification result
• Previous submissions

Decision

[Accept Work]
[Request Revision]
[Open Dispute]
```

The human reviewer should see the evidence needed to make the decision.

The UI must not offer a dangerous generic:

```text
[Force Payment]
```

Instead, any human decision must feed back into the same controlled backend workflow and policy system.

---

# 17. Provider Portal

The provider experience should be intentionally simpler.

### Available Work

```text
Available Work

Clean customer dataset
$135
Deadline: 8 hours
Requirements: 5

[View Work]
```

### Work Detail

```text
Clean customer dataset

Scope
...

Acceptance
...

Payment
$135 after successful verification

[Accept Work]
```

### Submission

```text
Submit Work

Files
[Upload cleaned_dataset.csv]

Notes
[ ...]

[Submit for Verification]
```

The provider should clearly understand that:

> **Submitting work does not automatically trigger payment.**

Verification determines whether the contractual acceptance conditions have been satisfied.

---

# 18. Realtime Updates

Long-running operations should not require the user to repeatedly refresh the page.

The frontend should use the API's realtime mechanism, such as Server-Sent Events, for task activity.

Conceptually:

```text
Backend event
      ↓
Event projection
      ↓
SSE
      ↓
Browser
      ↓
Update task workspace
```

Examples:

- provider selected
- negotiation completed
- payment authorized
- submission received
- verification started
- verification completed
- case opened
- payment captured

Realtime events are hints to refresh/update UI state.

The browser must not assume that receiving an event makes the event authoritative. It should reconcile against API state where necessary.

---

# 19. Frontend State Model

Frontend state should be divided into three categories.

### Server State

Data originating from the API:

- task
- contract
- provider
- negotiation
- payment
- verification
- activity
- case

This is authoritative only on the server.

### UI State

Temporary browser state:

- open modal
- selected tab
- expanded section
- form input
- loading indicator
- filter
- pagination position

This can safely disappear.

### Session State

Authentication/session-related information supplied by the application authentication mechanism.

The frontend must never use locally stored values as proof of authority.

---

# 20. API Interaction Pattern

Frontend operations should follow:

```text
User action
    ↓
UI validation
    ↓
API request
    ↓
Authentication
    ↓
Authorization
    ↓
Application service
    ↓
Domain operation
    ↓
Persistence / external operation
    ↓
API response
    ↓
UI update
```

For example:

```text
[Approve Contract]
       ↓
POST /api/v1/contracts/{id}/approve
       ↓
Backend verifies:
  • user identity
  • ownership
  • contract status
  • contract version
  • authority
       ↓
Contract approved
       ↓
Agent workflow continues
       ↓
Frontend receives updated state
```

The frontend must never implement the actual approval rules itself.

---

# 21. Loading, Failure, and Empty States

Because WorkPay contains long-running and external operations, failure states are part of the primary UX rather than edge cases.

Examples:

### Loading

```text
Finding providers...
```

### External delay

```text
PayPal is taking longer than expected.

Your payment state is being reconciled.
You do not need to retry.
```

### Agent failure

```text
The agent could not complete this step automatically.

No payment was released.

[Review]
```

### Network interruption

```text
Connection interrupted.

Your task is still running.
Reconnecting...
```

### Empty state

```text
No active tasks yet.

Give WorkPay something to do.

[Create your first task]
```

The interface should never imply that an operation failed simply because the browser lost connectivity.

---

# 22. Approval UX

Approval gates are especially important because they represent authority transfer.

The UI should explicitly state:

```text
You are authorizing WorkPay to:

• Hire a provider for this contract
• Spend up to $150
• Negotiate within the defined limits
• Release payment only after successful verification

WorkPay cannot:

• Increase your budget
• Change the scope without approval
• Pay outside this agreement
• Override failed verification
```

This makes the product's **bounded autonomy** visible.

---

# 23. Agent Transparency

WorkPay should expose **agent actions**, not private chain-of-thought.

Good:

```text
Agent action

Selected Provider B because:
• Provider A exceeded the deadline
• Provider B met all hard requirements
• Provider B had the highest expected success score
```

Bad:

```text
The model's internal reasoning was:
...
```

The system should provide sufficient evidence for users to understand and audit decisions without exposing hidden reasoning traces.

---

# 24. Responsive and Accessibility Requirements

The application should be usable on desktop first because the primary buyer workflow contains substantial information.

However, core actions should remain usable on smaller screens:

- task status
- approval
- payment status
- verification result
- provider status
- activity

Accessibility should include:

- keyboard navigation
- semantic controls
- visible focus states
- sufficient text contrast
- accessible error messages
- status updates that work with assistive technologies
- confirmation for consequential actions

Important actions should never rely exclusively on color.

For example:

```text
✓ Verification passed
✕ Verification failed
! Human review required
```

rather than color alone.

---

# 25. Security at the Frontend Boundary

The frontend must assume that everything it receives can eventually be inspected or manipulated by the user.

Therefore:

- never embed secrets
- never embed PayPal private credentials
- never trust client-side authorization
- never calculate authoritative payment amounts
- never allow browser state to bypass approval
- never expose another user's resource through predictable identifiers
- escape/render untrusted provider content safely
- protect authenticated requests against CSRF where applicable
- use secure session handling
- avoid storing sensitive financial information unnecessarily

Uploaded provider artifacts and user-provided files must be treated as untrusted content.

---

# 26. Product-Level Error Model

Backend errors should be translated into useful user-facing messages.

Instead of:

```text
HTTP 409 / PAYMENT_STATE_CONFLICT
```

the UI should communicate:

```text
Payment state changed

The payment was already captured, so this action
cannot be repeated.
```

Technical details may remain available for support/debugging, but they should not dominate the user experience.

---

# 27. Frontend Architecture

The frontend should be organized around domain-facing feature boundaries rather than one enormous component tree.

A reasonable MVP structure:

```text
frontend/
├── app/
│   ├── routes/
│   ├── layout/
│   └── providers/
│
├── features/
│   ├── tasks/
│   ├── contracts/
│   ├── providers/
│   ├── negotiations/
│   ├── payments/
│   ├── verification/
│   ├── activity/
│   └── cases/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── api/
│   ├── client/
│   ├── queries/
│   └── mutations/
│
└── realtime/
    └── events/
```

This is a conceptual organization rather than a requirement to create a separate package or service for every feature.

The frontend remains one deployable application for the MVP.

---

# 28. Navigation Model

The user should rarely need to navigate through multiple pages to understand a task.

The primary hierarchy is:

```text
My Tasks
    ↓
Task
    ├── Overview
    ├── Contract
    ├── Provider
    ├── Work
    ├── Verification
    ├── Payment
    └── Activity
```

These can be tabs, sections, or contextual panels depending on the final visual design.

The important architectural requirement is that they all represent the same underlying Task and its related domain objects.

---

# 29. Demo-Critical UX

For the hackathon, the frontend must make the autonomous economic loop visually obvious.

The ideal demo should be understandable even to someone who has never heard of WorkPay.

The sequence should look roughly like:

```text
1. User creates task
          ↓
2. AI interprets task
          ↓
3. Contract appears
          ↓
4. User approves bounded authority
          ↓
5. AI selects/negotiates provider
          ↓
6. PayPal authorization appears
          ↓
7. Provider submits work
          ↓
8. Verification fails
          ↓
9. Provider revises
          ↓
10. Verification passes
          ↓
11. PayPal payment captured
```

The UI should make each transition visible.

The most important demo moments are:

**Contract creation**

> “This is exactly what the agent is authorized to buy.”

**Payment authorization**

> “The money is committed, but not yet earned.”

**Verification failure**

> “The provider submitted something, but WorkPay refused to release the money.”

**Successful verification**

> “The work now satisfies the contract.”

**Payment capture**

> “The system can finally settle the transaction.”

That sequence communicates the product thesis much better than a conventional dashboard.

---

# 30. What Component 16 Must Never Do

The frontend must never:

- directly call PayPal APIs using private credentials
- directly modify database state
- decide whether work passed verification
- decide whether payment should be captured
- grant agent authority
- modify a contract without backend validation
- trust client-provided user IDs
- treat local state as authoritative
- bypass human approval gates
- expose unrestricted agent tools
- invent workflow state
- silently change economic terms

The frontend is a **presentation and interaction boundary**, not a business-authority boundary.

---

# 31. MVP Implementation

For the MVP, keep the frontend intentionally small.

### Buyer

Required:

- authentication
- New Task
- My Tasks
- Task Workspace
- Contract Approval
- Provider Selection/Negotiation view
- Payment status
- Verification results
- Activity timeline
- Human-review state

### Provider

Required:

- Available Work
- Work Detail
- Accept Work
- Submit Work
- Submission status
- Payment status

### Realtime

Use SSE for task/activity updates.

### Styling

Use a single consistent design system rather than building custom visual systems for each feature.

### State

Use server-state fetching/cache plus lightweight local UI state.

Do not introduce a complex client-side state architecture unless actual requirements demand it.

---

# 32. Frontend Invariants

The frontend must preserve these invariants:

1. **Server state is authoritative.**
2. **Client state is disposable.**
3. **Every consequential operation goes through the API.**
4. **Approval refers to a specific contract version.**
5. **Payment status is read from authoritative backend state.**
6. **Verification results come from the verification system.**
7. **Agent actions are presented as actions, not as authority.**
8. **Realtime events do not replace authoritative API state.**
9. **Provider content is untrusted.**
10. **The UI never provides a path around backend policy.**

---

# 33. Final Guarantee

Component 16 guarantees that WorkPay exposes a coherent, trustworthy interface over the underlying agentic workflow.

The user can:

- express work,
- understand the resulting contract,
- approve bounded authority,
- see who was selected,
- observe negotiation,
- see payment authorization,
- monitor execution,
- understand verification,
- intervene when necessary,
- and see exactly when and why payment is released.

The frontend does not become another source of business truth.

It makes the system's existing guarantees **visible and usable**.

## Boundary

> **Component 16 turns WorkPay's backend capabilities into a coherent web application. It owns presentation, interaction, client-side state, navigation, and user experience. It does not own authorization, business rules, verification, payment decisions, or authoritative state.**