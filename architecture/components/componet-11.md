# Component 11 — Agent Orchestrator & Workflow State Machine

## 1. Responsibility

The **Agent Orchestrator** is the runtime that coordinates the entire task lifecycle.

Its responsibility is:

> **Observe the current state of a task, determine the next permitted action, invoke the appropriate domain component, and continue the workflow until the task reaches a terminal state or requires human intervention.**

Without this component, the system is simply a collection of services:

```text
Task Service
Contract Service
Provider Service
Payment Service
Verification Service
Dispute Service
```

The orchestrator turns them into an autonomous workflow:

```text
User Intent
    ↓
Plan
    ↓
Contract
    ↓
Find Provider
    ↓
Negotiate
    ↓
Authorize
    ↓
Execute
    ↓
Verify
    ↓
Settle
```

The critical architectural principle is:

> **The agent decides what should happen next; deterministic domain services decide whether that action is permitted.**

---

# 2. Why the Orchestrator Exists

The system has many state transitions.

For example:

```text
TASK_CREATED
      ↓
PLANNING
      ↓
CONTRACT_READY
      ↓
AWAITING_APPROVAL
      ↓
ACTIVE
      ↓
PROVIDER_SELECTED
      ↓
NEGOTIATING
      ↓
AGREEMENT_ACCEPTED
      ↓
PAYMENT_AUTHORIZED
      ↓
WORK_IN_PROGRESS
      ↓
SUBMITTED
      ↓
VERIFYING
      ↓
VERIFIED
      ↓
PAYMENT_ELIGIBLE
      ↓
CAPTURED
      ↓
COMPLETED
```

Something needs to coordinate these transitions.

That is the orchestrator.

However, it must **not** become a giant function containing all business rules.

Bad architecture:

```typescript id="z4b4zj"
agent.run() {
    if (...) {
        ...
    } else if (...) {
        ...
    } else if (...) {
        ...
    }
}
```

That becomes impossible to audit.

Instead:

```text id="9q9x8f"
Agent Orchestrator
       │
       ├── Task Service
       ├── Planner
       ├── Contract Service
       ├── Provider Service
       ├── Negotiation Service
       ├── Payment Service
       ├── Execution Service
       ├── Verification Engine
       ├── Policy Engine
       └── Case Manager
```

The orchestrator coordinates.

The domain components enforce.

---

# 3. Core Principle

The architecture separates three concepts:

### Intelligence

The AI decides:

> “Given the current state, what would be the most useful next action?”

### Authority

Deterministic services decide:

> “Is that action actually permitted?”

### Execution

A domain service performs:

> “Execute the permitted action.”

Therefore:

```text id="m0sm5w"
AI Agent
   │
   │ proposes action
   ▼
Policy / Domain Validation
   │
   ├── DENY
   │
   └── ALLOW
          │
          ▼
       Execute
```

This pattern must exist for every consequential action.

---

# 4. Agent Is Not the System

The AI model should never be treated as the authoritative representation of the task.

The source of truth remains the database and deterministic domain state.

The agent observes:

```text id="yq0c0c"
Task State
Contract State
Provider State
Negotiation State
Payment State
Execution State
Verification State
Case State
```

Then produces a proposed action.

For example:

```json id="1f7m9x"
{
  "action": "SELECT_PROVIDER",
  "reason": "Provider C has the highest expected completion value within budget."
}
```

The orchestrator validates whether that action is legal.

---

# 5. Agent Runtime

The runtime can be modeled as:

```text id="j8y7fz"
┌───────────────────────────────────────┐
│ Agent Runtime                         │
│                                       │
│  Observe                              │
│     ↓                                 │
│  Build Context                        │
│     ↓                                 │
│  Reason                               │
│     ↓                                 │
│  Propose Action                       │
│     ↓                                 │
│  Validate Action                      │
│     ↓                                 │
│  Execute                              │
│     ↓                                 │
│  Record Result                        │
│     ↓                                 │
│  Observe Again                        │
└───────────────────────────────────────┘
```

This loop continues until:

```text id="1p7p4s"
COMPLETED
CANCELLED
DISPUTED
EXPIRED
HUMAN_REVIEW
```

---

# 6. Agent State

The agent itself should not maintain the authoritative workflow state only in memory.

Its persistent state is:

```typescript id="k4yq9d"
type AgentRun = {
  id: string;

  taskId: string;

  status:
    | "RUNNING"
    | "WAITING"
    | "PAUSED"
    | "COMPLETED"
    | "FAILED";

  currentStep: string | null;

  iteration: number;

  lastActionId: string | null;

  createdAt: string;

  updatedAt: string;
};
```

The task and domain entities remain authoritative.

`AgentRun` describes the agent's execution process.

---

# 7. Action Model

Every agent action should be explicit.

```typescript id="c3i7bz"
type AgentAction = {
  id: string;

  agentRunId: string;

  taskId: string;

  type:
    | "CREATE_PLAN"
    | "REQUEST_CLARIFICATION"
    | "CREATE_CONTRACT"
    | "SELECT_PROVIDER"
    | "START_NEGOTIATION"
    | "SEND_OFFER"
    | "ACCEPT_OFFER"
    | "AUTHORIZE_PAYMENT"
    | "REQUEST_REVISION"
    | "START_VERIFICATION"
    | "OPEN_CASE"
    | "WAIT"
    | "COMPLETE_TASK";

  input: unknown;

  status:
    | "PROPOSED"
    | "VALIDATING"
    | "APPROVED"
    | "REJECTED"
    | "EXECUTED"
    | "FAILED";

  createdAt: string;
};
```

This makes agent behavior inspectable.

---

# 8. Proposed vs Executed Actions

This distinction is essential.

The AI might propose:

```text id="z1h8q5"
CAPTURE_PAYMENT
```

The action is not executed immediately.

Instead:

```text id="r9z6cd"
PROPOSED
    ↓
Policy Validation
    ↓
REJECTED
```

because verification has not passed.

Conversely:

```text id="o4f6a7"
SELECT_PROVIDER
    ↓
Eligibility Check
    ↓
APPROVED
    ↓
Provider Service
```

This creates a clean security boundary.

---

# 9. Agent Tool Architecture

The AI should interact with a limited set of tools.

Example:

```typescript id="x1h5jp"
interface AgentTools {
  getTaskState(): Promise<TaskState>;

  getWorkSpecification(): Promise<WorkSpecification>;

  getContract(): Promise<WorkContract>;

  searchProviders(): Promise<ProviderCandidate[]>;

  negotiate(): Promise<NegotiationState>;

  getPaymentState(): Promise<PaymentState>;

  getVerificationState(): Promise<VerificationState>;

  requestClarification(): Promise<void>;

  requestRevision(): Promise<void>;
}
```

Notice what is missing:

```text id="0s4m7j"
capturePayPal()
changeBudget()
modifyContract()
overrideVerification()
```

Those are not unrestricted AI tools.

The agent can request an action through the orchestrator, but the domain service decides whether it is valid.

---

# 10. Consequential Tool Calls

For actions that affect the real world, use a two-stage pattern:

```text id="v0x1ly"
AI
 ↓
Propose Action
 ↓
Deterministic Validation
 ↓
Execute
```

For example:

```text id="z5s0di"
AI:
"Authorize $135."

 ↓

Payment Policy:
"Is $135 authorized by the agreement?"

 ↓

YES

 ↓

Payment Service:
"Create PayPal authorization."
```

The model never gets raw payment credentials.

---

# 11. State Machine

The task lifecycle should be represented explicitly.

A simplified state machine:

```text id="v1d2tm"
CREATED
   ↓
PLANNING
   ├──→ REQUIRES_CLARIFICATION
   │          ↓
   │       PLANNING
   │
   ↓
CONTRACT_REVIEW
   ↓
AWAITING_APPROVAL
   ↓
ACTIVE
   ↓
PROVIDER_DISCOVERY
   ↓
NEGOTIATION
   ├──→ PROVIDER_REJECTED
   │          ↓
   │    PROVIDER_DISCOVERY
   │
   ↓
AGREEMENT_READY
   ↓
PAYMENT_AUTHORIZATION
   ↓
WORK_IN_PROGRESS
   ↓
SUBMITTED
   ↓
VERIFYING
   ├──→ REVISION_REQUIRED
   │          ↓
   │    WORK_IN_PROGRESS
   │
   ├──→ HUMAN_REVIEW
   │          ↓
   │    RESOLVED
   │
   ↓
PAYMENT_RELEASE
   ↓
COMPLETED
```

Terminal states:

```text id="5q8h1f"
COMPLETED
CANCELLED
EXPIRED
DISPUTED
```

---

# 12. State Transitions Must Be Deterministic

The AI cannot simply say:

```text id="v5x5mg"
"Move task to COMPLETED."
```

The state machine checks:

```text id="7c9wq4"
Is verification PASS?
Is payment captured?
Are required artifacts present?
Are there open blocking cases?
```

Only then:

```text id="t7m1yd"
COMPLETED
```

The model proposes.

The state machine decides.

---

# 13. Transition Guard

Each state transition should have a guard.

```typescript id="sl7h5m"
type TransitionGuard = {
  from: TaskState;

  to: TaskState;

  validate(context: TaskContext): GuardResult;
};
```

Example:

```text id="3s0fqb"
VERIFYING → PAYMENT_RELEASE
```

Guard:

```text id="5y2c2k"
verification.result === PASS
AND
no blocking case
AND
payment.status === AUTHORIZED
```

If any condition fails:

```text id="2o0pqs"
transition denied
```

This prevents state corruption.

---

# 14. Event-Driven Orchestration

The orchestrator should respond primarily to domain events rather than polling everything continuously.

Examples:

```text id="i9zv4e"
TASK_CREATED
WORK_SPEC_READY
CONTRACT_APPROVED
PROVIDER_SELECTED
OFFER_ACCEPTED
PAYMENT_AUTHORIZED
SUBMISSION_CREATED
VERIFICATION_PASSED
VERIFICATION_FAILED
CASE_RESOLVED
PAYMENT_CAPTURED
```

Example:

```text id="z6w0qh"
VERIFICATION_PASSED
       ↓
Agent Orchestrator
       ↓
Evaluate current state
       ↓
Request Payment Policy
       ↓
Capture if permitted
```

---

# 15. Agent Wake-Up Model

The agent should not run continuously.

It wakes when something relevant happens.

```text id="5g78l1"
Event
 ↓
Agent Wake-up
 ↓
Load current task state
 ↓
Determine next action
 ↓
Execute
 ↓
Sleep until next event
```

This is cheaper, more predictable, and easier to debug.

---

# 16. Waiting Is a Valid Agent Action

An important design principle:

> **The correct autonomous action is sometimes to do nothing.**

For example:

```text id="9w5q4c"
Provider has until tomorrow.
```

The agent does not need to repeatedly ask:

> “Should I do something?”

Instead:

```text id="k1d4zq"
WAIT
until:
provider submission
deadline approaching
provider clarification
system event
```

This reduces unnecessary model calls.

---

# 17. Agent Memory

The agent should not rely on conversational memory as its source of truth.

Instead, it retrieves structured state.

The context builder assembles:

```text id="8j0s0m"
Task
+
Work Specification
+
Contract
+
Agreement
+
Provider
+
Payment
+
Execution
+
Verification
+
Cases
+
Recent Events
```

The AI sees the relevant current state.

---

# 18. Context Builder

The context builder is an important internal service.

```typescript id="9hrg5v"
interface AgentContextBuilder {
  build(taskId: string): Promise<AgentContext>;
}
```

Example context:

```json id="d4frl0"
{
  "task": {
    "status": "VERIFYING"
  },
  "contract": {
    "version": 1,
    "deadline": "2026-10-13T12:00:00Z"
  },
  "payment": {
    "status": "AUTHORIZED",
    "amount": 135
  },
  "submission": {
    "version": 2,
    "status": "UNDER_REVIEW"
  },
  "verification": {
    "status": "PASS"
  },
  "cases": []
}
```

The agent does not need the entire database.

---

# 19. Context Must Be Versioned

Agent decisions should record what state the agent observed.

```typescript id="0w7c2j"
type AgentDecision = {
  id: string;

  agentRunId: string;

  taskId: string;

  contextVersion: string;

  proposedAction: AgentAction;

  model: string;

  promptVersion: string;

  createdAt: string;
};
```

This allows debugging:

> “Why did the agent select this provider?”

You can reconstruct:

```text id="uxd6k5"
Agent context
+
model
+
prompt version
+
provider candidates
+
agent action
```

---

# 20. Agent Reasoning vs Audit Record

Do not store private chain-of-thought.

Instead store structured decision rationale.

Example:

```text id="o2a0b7"
Action:
SELECT_PROVIDER

Reason:
Provider C satisfies all hard requirements and has
the highest expected completion value within budget.

Factors:
- capability match: strong
- historical first-pass success: 95%
- estimated delivery: 6 hours
- price: $135
```

This is enough for product transparency and debugging.

---

# 21. Negotiation Agent

The orchestrator may invoke a negotiation agent.

But the negotiation agent operates within:

```text id="e5s8l7"
Commercial Agreement authority
```

Example:

```text id="5q9t4g"
Maximum:
$150

Agent proposes:
$125

Provider counters:
$140

Agent accepts:
$140
```

The orchestrator validates:

```text id="a7z0oe"
$140 <= $150
```

Then acceptance proceeds.

If provider counters:

```text id="l0f9y7"
$175
```

the action is rejected.

The AI cannot override the budget.

---

# 22. Provider Selection Agent

Likewise, provider selection is a bounded action.

The agent can say:

```text id="f5z1ce"
SELECT provider C
```

But the provider service validates:

```text id="g2n8q9"
provider active?
capability match?
deadline fit?
budget fit?
payment support?
```

If not:

```text id="h4n2r6"
REJECT
```

The agent must select another candidate.

---

# 23. Payment Actions

Payment actions require the strongest boundary.

The agent may propose:

```text id="k6t8w3"
AUTHORIZE_PAYMENT
```

or:

```text id="s4j7cp"
CAPTURE_PAYMENT
```

But these actions are passed to:

```text id="f5p1h0"
Payment Policy Engine
```

The policy engine determines whether they are legal.

This makes the agent incapable of bypassing payment controls even if the model behaves incorrectly.

---

# 24. Agent Loop Example

For the main demo:

```text id="p7x8f4"
User:
"Clean 5,000 customer records for $150."
```

Agent wakes.

```text id="n2j7sy"
Observe:
TASK_CREATED
```

Action:

```text id="g6t4ph"
CREATE_PLAN
```

Planner runs.

Then:

```text id="u5q2m0"
CREATE_CONTRACT
```

User approves.

Agent wakes:

```text id="d6w3a9"
PROVIDER_DISCOVERY
```

Provider service returns:

```text id="1g8b6n"
A
B
C
```

Agent selects C.

Then:

```text id="n9x0b7"
NEGOTIATE
```

Agreement:

```text id="t3c5w7"
$135
```

Payment authorization:

```text id="k7v3m1"
AUTHORIZED
```

Agent waits.

Provider submits.

Agent wakes.

```text id="p3x8f0"
START_VERIFICATION
```

Verification:

```text id="v9m6h2"
FAIL
```

Agent requests revision.

Provider resubmits.

Verification:

```text id="x4q7t1"
PASS
```

Agent proposes payment release.

Policy engine:

```text id="b8w2s4"
ALLOW
```

Payment service:

```text id="c1v5j8"
CAPTURE
```

Agent observes:

```text id="e6r3n9"
CAPTURED
```

State machine:

```text id="k2y5w6"
COMPLETED
```

This is the autonomous loop.

---

# 25. Agent Failure

Agents can fail.

For example:

```text id="7xq4h9"
Model timeout
Invalid structured output
Tool timeout
Unexpected tool response
Context unavailable
```

The orchestrator should distinguish:

```text id="x9b2q1"
Agent failure
```

from:

```text id="j4k7v8"
Business failure
```

A model timeout should not become:

```text
TASK_FAILED
```

automatically.

Instead:

```text id="q8w1e3"
Agent error
↓
Retry
↓
Fallback
↓
Human review if necessary
```

---

# 26. Retry Policy

Agent actions should have bounded retries.

```typescript id="t4h8x2"
type RetryPolicy = {
  maxAttempts: number;

  backoffSeconds: number[];

  retryableErrors: string[];
};
```

For example:

```text id="6c3z8w"
LLM timeout:
retry

Malformed JSON:
retry

Invalid business action:
do not blindly retry
→ rebuild context

Payment denial:
do not retry blindly
→ inspect policy result
```

This prevents infinite agent loops.

---

# 27. Loop Detection

An autonomous agent can otherwise get stuck:

```text id="y8h1f3"
SELECT A
↓
Rejected
↓
SELECT A
↓
Rejected
↓
SELECT A
↓
Rejected
```

The orchestrator tracks action history.

If the same action fails repeatedly:

```text id="p6r4v9"
Loop detected
↓
Pause agent
↓
Create exception
```

This is essential for reliability.

---

# 28. Budget on Agent Actions

Agent execution itself should be bounded.

Define:

```typescript id="o8s6z1"
type AgentExecutionLimits = {
  maxIterations: number;

  maxModelCalls: number;

  maxNegotiationRounds: number;

  maxProviderSearches: number;

  maxExecutionTimeSeconds: number;
};
```

Example:

```text id="h3y7c5"
maxIterations = 30
maxNegotiationRounds = 5
maxModelCalls = 20
```

If exceeded:

```text id="w1z8m4"
AGENT_LIMIT_REACHED
↓
Pause
↓
Human review
```

This protects both cost and system behavior.

---

# 29. Agent Authority Is Separate From User Authority

The user might approve:

```text id="v8c2d7"
Maximum task budget:
$150
```

That does not mean:

```text
Agent can spend unlimited money.
```

The authority chain is:

```text id="9d4q1f"
User Approval
      ↓
Work Contract Authority
      ↓
Commercial Agreement Authority
      ↓
Payment Policy
      ↓
PayPal
```

Every layer can narrow authority.

None can silently broaden it.

---

# 30. User Interruption

The user must be able to stop the agent.

Web UI:

```text id="u3m8p4"
[ Pause Agent ]
[ Cancel Task ]
```

Pause means:

```text id="q1v6n9"
stop autonomous progress
preserve current state
do not cancel existing contractual/payment obligations
```

Cancel means:

```text id="m7x2c5"
begin cancellation workflow
```

These are different.

---

# 31. Agent Pause Behavior

If the user presses:

```text id="3x7n1b"
PAUSE
```

the orchestrator:

```text id="a5v8k2"
stops new agent actions
```

But it must not necessarily:

```text
void PayPal
cancel provider work
refund money
```

unless the cancellation policy says so.

Pause is an orchestration state.

Cancellation is a business operation.

---

# 32. Human Approval Gates

The system should support configurable approval gates.

Examples:

```text id="1x7b3p"
Contract approval
→ always human

Payment above $500
→ human

Scope change
→ human

Provider selection
→ autonomous

Negotiation within $150
→ autonomous
```

The agent checks:

```text id="q7w5e1"
Does this action require approval?
```

If yes:

```text id="z2r9m4"
WAITING_FOR_HUMAN
```

The user sees the required decision in the UI.

---

# 33. Agent Activity UI

The user should have a clear view of what the agent is doing.

Task page:

```text id="j6f4s8"
┌──────────────────────────────────────────────────────────┐
│ AI Agent                                                 │
│                                                          │
│ ● Finding a provider                                    │
│   Comparing 3 eligible providers                         │
│                                                          │
│ ✓ Contract approved                                      │
│ ✓ Budget: $150                                           │
│ ✓ Payment limit: $150                                   │
│                                                          │
│ Agent authority                                          │
│ ✓ Select provider                                        │
│ ✓ Negotiate within budget                               │
│ ✓ Authorize approved payment                            │
│ ✕ Change requirements                                    │
│ ✕ Increase budget                                        │
└──────────────────────────────────────────────────────────┘
```

The UI should make autonomous behavior feel controlled rather than mysterious.

---

# 34. Agent Action Timeline

The Activity page can expose agent actions:

```text id="q7h2p9"
10:02  Task created

10:03  AI created work specification

10:03  Contract prepared

10:04  You approved the contract

10:04  AI evaluated 3 providers

10:04  Provider C selected

10:05  AI negotiated $135

10:05  Payment authorized

10:07  Provider submitted work

10:08  Verification failed

10:08  AI requested correction

10:12  Provider resubmitted

10:13  Verification passed

10:13  Payment policy approved release

10:13  PayPal capture completed
```

This is one of the most important UX surfaces in the application.

---

# 35. Agent Transparency

The product should never make the user wonder:

> “What is the AI doing with my money?”

The interface should communicate:

```text id="j8f4x2"
WHAT THE AI CAN DO
WHAT THE AI CANNOT DO
WHAT IT JUST DID
WHY IT DID IT
WHAT HAPPENS NEXT
```

But avoid exposing internal chain-of-thought.

Instead show concise decision explanations.

---

# 36. Agent Observability

Every agent run should record:

```text id="5x7c1z"
agent_run_id
task_id
iteration
context_version
action
tool
result
latency
model
prompt_version
error
```

Metrics:

```text id="q4n7k1"
agent_success_rate
average_iterations
average_model_calls
tool_failure_rate
human_escalation_rate
workflow_completion_time
agent_action_rejection_rate
```

These help identify bad agent behavior.

---

# 37. Agent Security Boundary

The most important security diagram is:

```text id="1h7s8k"
                    AI MODEL
                       │
                  proposes action
                       │
                       ▼
               AGENT ORCHESTRATOR
                       │
              ┌────────┴────────┐
              │                 │
       Domain Validation    Policy Engine
              │                 │
              └────────┬────────┘
                       │
                  permitted
                       │
                       ▼
                  DOMAIN SERVICE
                       │
                       ▼
                   EXTERNAL API
```

The model is never the final authority.

This protects against:

- prompt injection
- hallucinated actions
- incorrect model reasoning
- compromised tool context
- malicious provider content
- accidental financial actions

---

# 38. Prompt Injection Defense

Every external content source is treated as untrusted:

```text id="f3q1w8"
User input
Provider messages
Uploaded files
Provider profile
External service responses
```

The agent context builder labels data according to its origin.

For example:

```text id="u7d9k4"
CONTRACT:
AUTHORITATIVE

PAYMENT STATE:
AUTHORITATIVE

PROVIDER MESSAGE:
UNTRUSTED

UPLOADED FILE:
UNTRUSTED

AI SUGGESTION:
NON-AUTHORITATIVE
```

The model can reason over all of them, but only authoritative domain services can change actual state.

---

# 39. Agent Tool Permissions

Tools should be grouped by risk.

### Read tools

```text id="4w6s9h"
getTask
getContract
getProvider
getPayment
getVerification
```

Low risk.

### Business action tools

```text id="g2z8p6"
selectProvider
startNegotiation
requestRevision
```

Validated by domain services.

### Financial actions

```text id="m1k7x3"
authorizePayment
capturePayment
refundPayment
```

Never directly exposed as unrestricted model tools.

They require policy authorization.

---

# 40. Modular Implementation

The orchestrator can live in:

```text id="f6c9x2"
backend/
├── agent/
│   ├── orchestrator/
│   ├── context/
│   ├── actions/
│   ├── tools/
│   ├── policies/
│   ├── state-machine/
│   └── retries/
```

The rest of the application remains:

```text id="z1f6b3"
backend/
├── tasks/
├── planner/
├── contracts/
├── providers/
├── negotiation/
├── payments/
├── verification/
├── cases/
├── events/
└── agent/
```

This remains a modular monolith.

There is no need for microservices for the hackathon.

---

# 41. Transaction Boundaries

The orchestrator should not hold a database transaction open while calling an LLM or external API.

Bad:

```text id="w7q2c8"
BEGIN TRANSACTION
 ↓
Call LLM
 ↓
Call PayPal
 ↓
COMMIT
```

Instead:

```text id="v9r1m3"
Persist intent
 ↓
Commit
 ↓
Call external system
 ↓
Persist result
 ↓
Emit event
```

This avoids long-running transactions and makes recovery possible.

---

# 42. Exactly-Once Illusion

Distributed systems rarely provide true exactly-once execution across all boundaries.

The architecture should therefore aim for:

> **At-least-once event delivery + idempotent domain operations.**

For example:

```text id="p4v7z2"
VERIFICATION_PASSED
```

may be delivered twice.

The payment workflow must still result in only one capture.

This is why Components 6 and 9 use:

- idempotency keys
- payment state validation
- immutable decisions
- reconciliation

The orchestrator relies on those guarantees.

---

# 43. Recovery

If the orchestrator crashes:

```text id="n6q3y8"
Agent running
↓
Server crashes
```

When it restarts:

```text id="h5x9c1"
Load AgentRun
↓
Load authoritative task state
↓
Determine last completed action
↓
Resume from durable state
```

It must not trust in-memory state.

---

# 44. Event Ordering

Events may arrive out of order.

Example:

```text id="g4r8m2"
SUBMISSION_CREATED
VERIFICATION_STARTED
VERIFICATION_PASSED
```

If `VERIFICATION_PASSED` arrives before another informational event, the system should still operate correctly.

The authoritative state machine should validate transitions based on actual state.

Invalid transition:

```text id="x7c2n5"
CREATED → COMPLETED
```

must be rejected even if an event claims it happened.

---

# 45. Task Completion

The orchestrator should only mark the task completed after:

```text id="9f6x2b"
Work accepted
AND
Payment settlement confirmed
AND
No blocking case
```

For example:

```text id="q5c7m1"
Verification PASS
Payment ALLOW
Capture REQUESTED
```

is not yet `COMPLETED`.

Only:

```text id="k9v3s6"
PayPal capture confirmed
```

allows final completion.

This prevents the UI from declaring success before money actually settles.

---

# 46. Final Task State

The final state might be:

```typescript id="z4q7v8"
type TaskTerminalState =
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "DISPUTED";
```

A completed task contains references to:

```text id="r2m8s4"
Work Contract
Commercial Agreement
Provider
Submission
Verification
Payment Decision
PayPal Transaction
```

This creates the complete economic record.

---

# 47. MVP Agent Strategy

For the hackathon, do not build a completely open-ended autonomous agent.

Use a **bounded workflow agent**.

The agent can autonomously perform:

```text id="w5j9c3"
✓ interpret task
✓ prepare contract
✓ select provider
✓ negotiate within limits
✓ request payment authorization
✓ monitor execution
✓ request verification
✓ request revision
✓ trigger payment policy evaluation
```

The agent cannot autonomously:

```text id="b2n8x7"
✕ change scope
✕ increase budget
✕ override verification
✕ override policy
✕ bypass disputes
✕ directly call PayPal capture
```

This gives you a strong agentic story without introducing dangerous complexity.

---

# 48. The Agent's Real Job

The agent is not:

> “An AI chatbot that knows how to use PayPal.”

That is a weak product.

The agent is:

> **A bounded economic operator that coordinates work from intent through verified settlement.**

It continuously answers:

```text id="e9f5s2"
What is the current state?
        ↓
What is the next useful action?
        ↓
Is that action permitted?
        ↓
Execute it.
        ↓
Observe the result.
        ↓
Continue or escalate.
```

That is actual agentic behavior.

---

# 49. Complete Orchestration Example

The complete runtime looks like:

```text id="p3x7k8"
USER
"Clean 5,000 records for $150."
        │
        ▼
TASK CREATED
        │
        ▼
AGENT WAKES
        │
        ▼
PLAN
        │
        ▼
CONTRACT
        │
        ▼
USER APPROVES
        │
        ▼
AGENT SELECTS PROVIDER
        │
        ▼
NEGOTIATION
        │
        ▼
$135 AGREEMENT
        │
        ▼
PAYMENT AUTHORIZED
        │
        ▼
AGENT WAITS
        │
        ▼
PROVIDER SUBMITS
        │
        ▼
VERIFICATION
        │
        ├──── FAIL
        │       ↓
        │    REQUEST REVISION
        │       ↓
        │    WAIT
        │
        ▼
PASS
        │
        ▼
PAYMENT POLICY
        │
        ▼
ALLOW
        │
        ▼
PAYPAL CAPTURE
        │
        ▼
CAPTURE CONFIRMED
        │
        ▼
TASK COMPLETED
```

This is the system's central autonomous loop.

---

# 50. Final Guarantee

The Agent Orchestrator guarantees:

> **The AI can coordinate the lifecycle of an economic task without becoming the authority that controls the underlying economic state.**

Specifically:

- AI can reason.
- AI can propose.
- AI can coordinate.
- AI can wait.
- AI can communicate.
- AI can recover.
- AI can escalate.

But:

```text id="v6x1m9"
Contracts enforce scope.

Domain services enforce state.

Policy engines enforce authority.

Verification enforces acceptance.

PayPal enforces settlement.
```

That division is the foundation of safe agentic commerce.

**Component 11 boundary:**

> **Components 1–10 define what the system is allowed to do. Component 11 coordinates those capabilities into an autonomous workflow. The agent is therefore the conductor of the system, not the owner of its authority.**