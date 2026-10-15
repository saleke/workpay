# Component 0 — Product Experience & Application Architecture

## 0.1 Purpose

The product is delivered as a **browser-based web application**.

Users access the platform through a standard web browser and interact with the system through a unified application interface. The web application is the primary presentation and control surface for the entire WorkPay workflow.

The application hides the underlying complexity of AI planning, provider discovery, negotiation, payment orchestration, verification, and settlement behind a single task-oriented experience.

The user should experience the product as:

> **“I tell the agent what I need done, approve what it proposes, and monitor the result.”**

The user should not need to understand the internal services, AI agents, PayPal APIs, provider-matching algorithms, verification engines, or event-processing infrastructure.

---

# 0.2 Product Access Model

The primary access model is:

```text
User
  │
  ▼
Web Browser
  │
  ▼
WorkPay Web Application
  │
  ▼
Authenticated Session
  │
  ▼
User Workspace
```

The application is accessed through a web URL such as:

```text
https://app.workpay.example
```

The exact production domain is implementation-specific.

For the hackathon MVP, the application should be optimized for **desktop and laptop browsers**, since the core workflow involves reviewing contracts, provider comparisons, payment information, deliverables, and verification evidence.

Responsive behavior should still be implemented so that the application remains usable on tablet and mobile-sized screens.

A native iOS or Android application is **not required for the MVP**.

---

# 0.3 Application Surfaces

The system has two primary user-facing surfaces.

## 0.3.1 Buyer / Task Owner Application

This is the primary WorkPay application.

The buyer is the person or organization asking the AI agent to obtain work on their behalf.

The buyer application provides:

- task creation
- file upload
- AI task interpretation
- clarification
- contract review
- contract approval
- provider selection visibility
- negotiation visibility
- PayPal authorization
- work monitoring
- deliverable review
- verification results
- payment status
- activity history
- evidence/audit history
- account and spending controls

The buyer's primary object is the **Task**.

The application should therefore be task-centric rather than module-centric.

---

## 0.3.2 Provider Application

Providers access a separate authenticated area of the same web application.

A provider may be:

- a human worker
- an AI agent
- an external service
- eventually, an API-backed service

The provider application provides:

- available/assigned work
- work requirements
- contract details
- commercial terms
- acceptance
- input files
- work status
- deliverable submission
- revision requests
- verification results
- payment status

The provider should not have access to the buyer's private account information, unrelated tasks, payment credentials, or internal agent reasoning.

---

# 0.4 Application Architecture

The web application should be treated as the presentation and interaction layer over the domain architecture.

```text
┌─────────────────────────────────────────────┐
│                 WEB BROWSER                 │
│                                             │
│  Buyer UI                    Provider UI    │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              WEB APPLICATION                │
│                                             │
│  Navigation                                 │
│  Pages / Screens                            │
│  Components                                 │
│  Forms                                      │
│  Task Workspace                             │
│  Activity Timeline                          │
│  Notifications                              │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 API LAYER                   │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│             APPLICATION DOMAIN              │
│                                             │
│ Tasks                                       │
│ Planner                                     │
│ Contracts                                   │
│ Providers                                   │
│ Negotiation                                 │
│ Payments                                    │
│ Execution                                   │
│ Verification                                │
│ Events                                      │
│ Agent                                      │
└──────────────────────┬──────────────────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        Application DB       External Systems
                                 │
                       ┌─────────┴─────────┐
                       │                   │
                     PayPal               AI
```

The UI must not contain authoritative business logic.

For example, the frontend may display:

> “Capture $135”

but the frontend must never be trusted to decide that $135 is actually capturable.

The backend determines whether the payment is authorized by the relevant contract, agreement, verification result, and policy.

---

# 0.5 Application Shell

The application uses a persistent application shell.

The shell provides:

- primary navigation
- account identity
- notifications
- current workspace context
- global actions
- system status where appropriate

The buyer shell should be approximately:

```text
┌─────────────────────────────────────────────────────────────┐
│ WorkPay                         Notifications     Account ▾ │
├───────────────┬─────────────────────────────────────────────┤
│               │                                             │
│ + New Task    │                                             │
│               │                                             │
│ My Tasks      │              MAIN CONTENT                   │
│               │                                             │
│ Active        │                                             │
│ Completed     │                                             │
│               │                                             │
│ Payments      │                                             │
│ Activity      │                                             │
│               │                                             │
│ Settings      │                                             │
│               │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

The left navigation should remain intentionally small.

The product should not expose every backend module as a navigation item.

For example, the user should **not** see:

```text
Planner
Contract Engine
Provider Matching
Negotiation Engine
Payment Orchestrator
Verification Engine
Event Bus
```

Those are implementation concepts, not user concepts.

Instead, the user sees:

```text
Tasks
Payments
Activity
Settings
```

The system internally performs the work required to make those experiences function.

---

# 0.6 Primary Navigation

The buyer navigation consists of:

### New Task

Primary call-to-action.

Starts the workflow:

```text
New Task
    ↓
Describe work
    ↓
Upload inputs
    ↓
AI planning
    ↓
Contract review
```

### My Tasks

The central area of the product.

Displays all tasks belonging to the authenticated user.

Tasks can be grouped by lifecycle:

```text
All
Active
Needs Attention
Completed
Cancelled
```

### Payments

Provides a financial view of the user's transactions.

It should show:

- authorized payments
- captured payments
- refunded payments
- failed payments
- pending payments

Payment information should remain connected to its originating task.

### Activity

Provides a chronological view of important system events.

This is not merely a technical event log.

It translates system events into understandable user-facing events.

### Settings

Contains:

- account settings
- PayPal connection
- spending controls
- notification preferences
- security
- provider preferences where applicable

---

# 0.7 The Task as the Primary Product Object

The most important UX decision is that the **Task is the central object of the application**.

Everything that happens economically should remain attached to the task that caused it.

For example:

```text
Task
│
├── Original Request
├── Work Specification
├── Contract
├── Provider
├── Negotiation
├── Commercial Agreement
├── PayPal Payment
├── Work Execution
├── Deliverables
├── Verification
└── Settlement
```

The user should therefore be able to open one task and understand its complete lifecycle without navigating across multiple unrelated sections.

---

# 0.8 Task Workspace

The primary screen after creating a task is the **Task Workspace**.

Conceptually:

```text
┌──────────────────────────────────────────────────────────────┐
│ ← My Tasks                                                   │
│                                                              │
│ Clean 5,000 customer records                                 │
│                                                              │
│ ● Work in progress          $135       Due tomorrow         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  OVERVIEW                                                    │
│                                                              │
│  Objective                                                   │
│  Clean and normalize the customer dataset.                  │
│                                                              │
│  Provider                                                    │
│  DataClean Pro                                               │
│  $135 · Estimated completion: 6 hours                       │
│                                                              │
│  PAYMENT                                                      │
│  $135 authorized through PayPal                              │
│  Capture occurs after successful verification                │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  WORK STATUS                                                 │
│                                                              │
│  ● Provider accepted                                         │
│  ● Payment authorized                                        │
│  ● Work in progress                                         │
│  ○ Deliverable submission                                    │
│  ○ Verification                                              │
│  ○ Payment capture                                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ACTIVITY                                                    │
│                                                              │
│  10:05  Payment authorized                                   │
│  10:04  Provider accepted                                    │
│  10:03  Provider selected                                    │
│  10:02  Contract approved                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The exact visual design can change, but the information hierarchy should remain.

The user should immediately understand:

1. What is being done?
2. What is its current state?
3. Who is doing it?
4. How much does it cost?
5. What happens next?
6. Has money moved?
7. Is anything requiring the user's attention?

---

# 0.9 Task Lifecycle UX

The task workspace should visually communicate the lifecycle.

The primary lifecycle is:

```text
CREATED
   ↓
PLANNING
   ↓
CONTRACT REVIEW
   ↓
APPROVED
   ↓
PROVIDER SEARCH
   ↓
NEGOTIATING
   ↓
PAYMENT AUTHORIZED
   ↓
WORK IN PROGRESS
   ↓
SUBMITTED
   ↓
VERIFYING
   ↓
COMPLETED
   ↓
PAYMENT CAPTURED
```

Not every internal state needs to appear in the UI.

The application should collapse technical states into understandable user-facing states.

For example:

```text
INTERNAL:
NEGOTIATION_INITIATED
OFFER_CREATED
OFFER_SENT
COUNTEROFFER_RECEIVED
OFFER_ACCEPTED
```

may appear to the buyer as:

> **Finding the best provider and agreeing on terms**

This keeps the UX understandable without hiding important economic events.

---

# 0.10 Contract Review Experience

Before the system is permitted to cause a real economic transaction, the user should receive a human-readable contract preview.

The screen should answer:

> **“What exactly is my AI about to buy?”**

The contract review screen should contain:

### What will be done

Plain-language objective.

### Requirements

Explicit acceptance criteria.

### Deadline

Exact deadline with timezone where relevant.

### Maximum budget

The maximum amount the system is permitted to spend.

### Expected price

The current expected commercial price, if already known.

### Provider constraints

Relevant restrictions.

### Payment condition

For example:

> Payment will only be released after the submitted work passes verification against the agreed acceptance criteria.

### AI authority

Clearly explain what the agent is allowed to do.

For example:

```text
The agent may:
✓ Find a provider
✓ Negotiate within your $150 budget
✓ Authorize up to $150 through PayPal
✓ Request corrections if work fails verification

The agent may not:
✕ Increase your budget
✕ Change the task requirements
✕ Pay for work that fails verification
✕ Spend money on another task
```

Primary action:

> **Approve & Let AI Hire**

Secondary action:

> **Edit Requirements**

This is one of the most important trust moments in the entire product.

---

# 0.11 Provider Selection Experience

When a provider is selected, the system should explain **why**.

The interface should not simply say:

> Provider selected.

Instead:

```text
Recommended provider

DataClean Pro

$135
Estimated completion: 6 hours
First-pass success: 95%
On-time rate: 98%

Why we selected them

✓ Meets all task requirements
✓ Available before deadline
✓ Strong historical success rate
✓ Lower expected failure risk
✓ Within your approved budget
```

Alternative providers can be shown in a collapsed section.

The user does not need to manually select a provider unless they choose to override the agent.

---

# 0.12 Payment Experience

Payments should be visible throughout the task lifecycle but should not dominate the workflow.

The application should distinguish:

```text
AUTHORIZED
```

from:

```text
CAPTURED
```

because they mean different things.

For example:

> **$135 authorized**

means funds have been reserved/authorized through PayPal, but payment has not yet been released to the provider.

After successful verification:

> **$135 paid**

The payment UI should make this distinction obvious.

The user should never have to infer whether money has actually moved.

---

# 0.13 Activity Timeline

Every economically meaningful task should have an activity timeline.

Example:

```text
10:02
You asked the agent to clean 5,000 customer records.

10:03
AI created a work contract.

10:03
You approved the contract.

10:04
DataClean Pro was selected.

10:05
$135 authorized through PayPal.

10:07
Provider submitted the first deliverable.

10:08
Verification failed.

Reason:
7.2% duplicate records detected.
Required maximum: 1%.

10:09
Payment remains protected.

10:11
Provider submitted a corrected deliverable.

10:12
Verification passed.

10:12
$135 captured through PayPal.
```

This timeline is important because it transforms an autonomous system from a **black box** into an observable process.

---

# 0.14 User Notifications

Notifications should be event-driven.

Examples:

- Contract requires approval
- Provider selected
- Provider accepted
- Payment authorized
- Work submitted
- Verification failed
- Provider requested revision
- Verification passed
- Payment captured
- Task requires human intervention

Notifications should link directly to the relevant task.

For example:

> **Verification failed**
>
> The submitted customer dataset did not meet the agreed acceptance criteria.
>
> **Review task**

---

# 0.15 Provider UX

The provider experience should be intentionally simpler than the buyer experience.

A provider opening a task should see:

```text
Clean Customer Dataset

PAY
$135

DEADLINE
Tomorrow, 12:00 PM

REQUIREMENTS
✓ Preserve customer IDs
✓ Remove duplicates
✓ Normalize email addresses
✓ No required fields missing

INPUT
customers.csv

PAYMENT
$135 paid after successful verification
```

Primary action:

> **Accept Work**

After acceptance:

> **Start Work**

After completing the work:

> **Submit Deliverable**

The provider should not need to understand:

- AI orchestration
- internal ranking algorithms
- policy engines
- payment adapters
- event architecture

They need to understand **what to do, what they will receive, when it is due, and how payment works**.

---

# 0.16 Human Intervention UX

Autonomy does not mean removing the human completely.

The UI must clearly identify situations where the system cannot safely continue.

Examples:

```text
Needs your attention

The provider requested an additional $35 because the
task appears larger than originally specified.

Your current maximum:
$150

Provider request:
$185

The agent cannot approve this automatically.

[Review Request]
```

Similarly:

```text
Verification uncertain

The automated verifier could not confidently determine
whether the submitted work satisfies requirement #3.

Payment has NOT been released.

[Review Evidence]
[Approve Manually]
[Request Revision]
```

This is important to the product's trust model.

The system should never silently make an uncertain economic decision.

---

# 0.17 Global UX Principle

The product should expose **decisions and consequences**, not internal complexity.

For example, the user should see:

> “Payment is protected until the work passes verification.”

rather than:

> “The payment orchestration service has transitioned the payment entity from AUTHORIZED to CAPTURE_PENDING.”

The latter is an implementation detail.

The former is the user's actual concern.

---

# 0.18 Frontend Architecture

The frontend should be organized around product domains rather than individual backend APIs.

Conceptually:

```text
frontend/
│
├── app/
│   ├── dashboard/
│   ├── tasks/
│   ├── payments/
│   ├── activity/
│   ├── settings/
│   └── provider/
│
├── components/
│   ├── task/
│   ├── contract/
│   ├── provider/
│   ├── payment/
│   ├── verification/
│   ├── activity/
│   └── shared/
│
├── features/
│   ├── task-creation/
│   ├── contract-approval/
│   ├── provider-selection/
│   ├── payment/
│   ├── work-submission/
│   └── verification/
│
└── lib/
    ├── api/
    ├── auth/
    ├── state/
    └── validation/
```

A framework such as Next.js can be used for the web application, but the architectural requirement is framework-independent.

---

# 0.19 Frontend Authority Boundary

The frontend is responsible for:

- displaying information
- collecting user input
- requesting actions
- showing state
- presenting evidence
- guiding users through workflows

The frontend is **not authoritative** for:

- payment amounts
- payment authorization
- contract validity
- provider eligibility
- verification results
- spending limits
- user permissions
- economic state transitions

The backend remains authoritative.

---

# 0.20 Definition of Done

The Product Experience & Application Architecture component is complete when the system has:

- a browser-based web application
- authenticated buyer experience
- authenticated provider experience
- clear application shell
- clear primary navigation
- task-centric workspace
- task lifecycle visualization
- contract review experience
- provider selection experience
- payment status experience
- activity timeline
- notification model
- human-intervention states
- responsive layouts
- clear separation between user-facing concepts and backend implementation concepts
- a defined frontend/backend authority boundary

The fundamental UX invariant is:

> **At any point in a task's lifecycle, the user must be able to understand what the agent is doing, why it is doing it, what authority it has, whether money is at risk, and what will happen next.**

The product should therefore feel like **one intelligent task-management experience**, not a collection of disconnected AI, marketplace, payment, and verification tools.