# Component 18 — Deployment, Security & Operations Architecture

## 1. Responsibility

Component 18 defines how WorkPay is deployed, secured, operated, monitored, recovered, and changed safely.

The architecture so far establishes what WorkPay does:

> understand work → create a contract → find and negotiate with a provider → authorize payment → execute work → verify → settle payment.

Component 18 establishes how that system remains trustworthy when running in the real world.

Its responsibility covers:

- runtime environments
- deployment
- secrets
- infrastructure security
- application security
- observability
- background workers
- backups
- recovery
- testing
- migrations
- operational controls
- failure detection
- production safety

The objective is not maximum infrastructure complexity.

The objective is:

> **A small system that can safely handle money, AI actions, external dependencies, and recoverable workflow state.**

---

# 2. Deployment Philosophy

The MVP should use a **modular monolith**.

There is no architectural requirement to deploy every WorkPay component independently.

A practical deployment is:

```text id="w7c3x1"
                    Internet
                       │
                ┌──────▼──────┐
                │   Frontend  │
                └──────┬──────┘
                       │ HTTPS
                ┌──────▼──────┐
                │ Application │
                │    Server   │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
      PostgreSQL    Job Worker   Object Storage
          │
      Outbox / Jobs
```

External services:

```text id="5u3j9q"
Application
   ├── PayPal
   ├── AI Provider
   ├── Object Storage
   └── Notification Provider
```

This provides a production-capable architecture without premature distributed-systems complexity.

---

# 3. Runtime Components

The MVP requires only a small number of runtime processes.

### Web/Application Server

Handles:

- API requests
- authentication
- authorization
- application services
- domain operations
- SSE connections where appropriate
- webhook endpoints

### Background Worker

Handles:

- agent progression
- outbox publishing
- asynchronous verification
- reconciliation
- external retries
- notifications
- cleanup jobs
- other long-running operations

### PostgreSQL

Authoritative persistence.

### Object Storage

Binary artifacts.

This is enough for the first production deployment.

---

# 4. Request vs Background Work

The application must distinguish between operations that belong inside an HTTP request and operations that should continue asynchronously.

Short operation:

```text id="1qz7eu"
HTTP Request
    ↓
Validate
    ↓
Domain operation
    ↓
Commit
    ↓
Response
```

Long-running operation:

```text id="8zj4pk"
HTTP Request
    ↓
Create workflow/job
    ↓
Commit
    ↓
202 Accepted
    ↓
Background Worker
    ↓
Agent / AI / Provider / Verification
```

The API should never keep a browser request open while waiting for:

- an LLM
- provider action
- human review
- file processing
- long verification
- PayPal reconciliation

---

# 5. Worker Architecture

The worker is not a second business system.

It executes work that has already been defined by the application architecture.

Examples:

```text id="9k5lq3"
Outbox publishing
Agent continuation
Verification job
Payment reconciliation
Notification delivery
```

A worker claims a job, executes it, records the result, and safely retries when appropriate.

Jobs must be idempotent wherever possible.

---

# 6. Job Lifecycle

A durable job should conceptually have:

```text id="f3v0mc"
PENDING
   ↓
RUNNING
   ↓
SUCCEEDED

or

RUNNING
   ↓
RETRY_PENDING
   ↓
RUNNING

or

RUNNING
   ↓
FAILED
```

A worker crash must not permanently strand a task in `RUNNING`.

The system should record enough information to identify stale work and safely recover it.

---

# 7. Retry Policy

Retries must be bounded.

For example:

```text id="h8j4z1"
Attempt 1
   ↓
failure
   ↓
Attempt 2
   ↓
failure
   ↓
Attempt 3
   ↓
failure
   ↓
FAILED / HUMAN_REVIEW
```

Retries should use exponential backoff where appropriate.

The system should not retry:

- invalid contracts
- invalid requests
- authorization failures
- deterministic verification failures
- malformed business state

Retries are primarily for transient infrastructure failures.

---

# 8. Financial Operations Are Special

Payment operations require stricter rules than normal background jobs.

A payment capture job must have:

- payment ID
- exact amount
- currency
- agreement reference
- contract version/hash
- authorization state
- idempotency key
- policy decision
- attempt metadata

Before executing capture, the worker should re-check the relevant authoritative state.

This prevents a stale job from performing an action that is no longer valid.

---

# 9. Agent Worker Safety

Agent execution must remain bounded.

An agent run should have:

- run ID
- task ID
- current state
- action count
- retry count
- start time
- timeout/deadline
- last successful action
- failure reason

The system should impose limits such as:

```text id="p3a4hm"
Maximum agent actions
Maximum execution duration
Maximum retries
Maximum negotiation rounds
Maximum external-call rate
```

If the agent exceeds a limit:

```text id="r4r5dw"
Agent stopped

Reason:
Execution limit reached.

Task remains intact.
No unauthorized payment occurred.
```

The agent should fail safely rather than continuing indefinitely.

---

# 10. Environment Architecture

At minimum:

```text id="4s0yqg"
Development
    ↓
Staging / Sandbox
    ↓
Production
```

Each environment has separate:

- database
- credentials
- PayPal environment
- AI credentials where appropriate
- storage
- configuration

Production data should never be casually copied into development.

Production secrets must never be committed to source control.

---

# 11. Configuration

Configuration should be environment-driven.

Examples:

```text id="9x3b7k"
DATABASE_URL
PAYPAL_ENV
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
AI_PROVIDER
AI_API_KEY
STORAGE_BUCKET
SESSION_SECRET
APPLICATION_URL
```

Configuration should be validated at application startup.

A missing critical secret should cause startup failure rather than allowing the application to run in an unsafe partial configuration.

---

# 12. Secret Management

Secrets must be stored using the deployment platform's secret-management mechanism or an appropriate secrets manager.

Never store secrets in:

- Git
- frontend source
- `.env` committed to the repository
- database records as ordinary application data
- logs
- agent context
- user-visible API responses

Secret access should be limited to the processes that actually require it.

For example:

```text id="r6d2ak"
Frontend
    → no PayPal secret

Application
    → PayPal secret

Worker
    → PayPal secret if payment jobs execute there
```

---

# 13. Application Security

WorkPay handles money, files, identities, and agent actions, so security must be treated as a domain requirement rather than an infrastructure afterthought.

Core protections include:

- secure authentication
- object-level authorization
- input validation
- output encoding
- CSRF protection where applicable
- rate limiting
- secure cookies/session handling
- HTTPS
- security headers
- dependency updates
- safe file handling
- webhook verification
- audit logging
- least-privilege credentials

---

# 14. Authorization Defense in Depth

Authorization should exist at the application/domain boundary even if the frontend hides unauthorized actions.

For example:

```text id="5xq6h0"
Browser hides:
[Approve Contract]

        ↓

Attacker manually calls API

        ↓

API checks:
identity
+
task ownership
+
role
+
contract state
+
version
+
authority

        ↓

ALLOW / DENY
```

The UI is not a security boundary.

---

# 15. Agent Security

The agent is one of the highest-risk components because it can initiate consequential workflows.

Its tool access must be explicit.

A task-scoped agent might receive:

```text id="8b5vpu"
read_task
read_contract
find_providers
request_offer
negotiate
request_verification
```

It should not receive an unrestricted:

```text id="d3r6av"
execute_any_payment()
```

Instead:

```text id="j6s7te"
Agent
   ↓
Propose CAPTURE
   ↓
Payment Policy
   ↓
Payment Service
   ↓
PayPal
```

This maintains the architecture's central security property:

> **AI can initiate intent; deterministic policy controls authority.**

---

# 16. Prompt Injection Defense

WorkPay processes content from:

- users
- providers
- uploaded files
- external services

Any of these may contain adversarial instructions.

Therefore:

```text id="n9j5wu"
Untrusted Content
        ↓
Data
        ↓
Evaluation
```

never:

```text id="e8r5yt"
Untrusted Content
        ↓
System Instruction
```

AI calls must maintain strict separation between trusted instructions and untrusted artifacts.

No document should be allowed to redefine:

- payment authority
- contract requirements
- verification rules
- system policies
- agent tools

---

# 17. File Security

Uploaded files must be treated as untrusted.

The system should consider:

- file type validation
- size limits
- malware scanning where appropriate
- safe object storage
- filename sanitization
- access-control checks
- checksum verification
- signed URLs with short lifetimes

Files should never become executable application code.

---

# 18. Database Security

PostgreSQL is the authoritative state store.

Production database access should be restricted to the application and authorized operational processes.

The application should use a dedicated database identity with only required permissions.

Administrative database access should be separate.

Backups must not be accessible through the normal application credentials.

---

# 19. Data Protection

WorkPay may contain:

- user information
- provider information
- task descriptions
- uploaded files
- commercial agreements
- payment metadata
- verification evidence

Only the information necessary for a given operation should be exposed to that actor or external provider.

Examples:

A provider needs:

```text id="x9c1a4"
work scope
requirements
deadline
payment terms
required inputs
```

They do not automatically need:

```text buyer's private account information
unrelated tasks
internal agent context
private system logs
```

---

# 20. Auditability

Important actions should be traceable.

The system should retain an audit trail for:

- contract approval
- contract amendments
- provider selection
- negotiation outcome
- payment authorization
- payment capture
- payment refund
- verification decisions
- human review
- disputes
- authority changes

Audit records should identify:

```text id="3jv8yr"
actor
action
resource
timestamp
correlation ID
relevant version/hash
result
```

Financially significant records should not be casually deleted.

---

# 21. Observability

WorkPay needs three primary forms of operational visibility.

### Logs

Explain what happened.

Examples:

```text id="9o5q8u"
payment.capture.requested
verification.completed
agent.action.failed
paypal.webhook.received
```

### Metrics

Explain how often and how well things happen.

Examples:

```text id="7g8f5n"
task_completion_rate
verification_failure_rate
payment_capture_success_rate
agent_failure_rate
paypal_latency
ai_latency
job_retry_rate
```

### Traces / Correlation

Explain how one operation moved through the system.

For example:

```text id="7m4q6v"
Task #1842
    ↓
Agent Run
    ↓
Provider Selection
    ↓
Agreement
    ↓
Payment Authorization
    ↓
Submission
    ↓
Verification
    ↓
Capture
```

A correlation ID should make this chain discoverable.

---

# 22. Operational Alerts

Alerts should focus on conditions that require intervention.

Examples:

- repeated PayPal failures
- payment reconciliation mismatch
- worker backlog
- repeated agent failures
- database connectivity failure
- webhook verification failures
- unusual payment activity
- storage failures
- authentication anomalies

Do not alert on every ordinary failed user action.

Operational noise makes real incidents harder to see.

---

# 23. Health Checks

The application should expose basic health information.

For example:

```text id="t5h9c4"
GET /health
```

and potentially a deeper readiness check:

```text id="x3z8v7"
GET /ready
```

Health checks should distinguish:

- process is alive
- application can serve traffic
- required dependencies are available

A temporary PayPal outage should not necessarily make the entire application appear dead.

The system may remain available while payment operations are temporarily paused.

---

# 24. Database Backups

PostgreSQL must be backed up automatically.

At minimum:

- regular automated backups
- retention policy
- protected backup storage
- periodic restore testing

A backup that has never been restored is not a proven recovery mechanism.

The operational process should periodically verify that backups can actually reconstruct a usable database.

---

# 25. Recovery Strategy

Recovery should preserve the most important property:

> **No economically significant state should be silently lost or duplicated.**

After a crash:

```text id="f2g5m9"
Restart
   ↓
Recover database
   ↓
Recover unfinished jobs
   ↓
Reconcile external operations
   ↓
Resume workflows
```

For example, if the application crashes immediately after requesting PayPal capture, the recovery process must determine the actual PayPal state before issuing another capture.

---

# 26. Disaster Recovery Priority

Not all data has equal recovery priority.

Highest priority:

1. financial records
2. contracts
3. task state
4. verification decisions
5. audit/events
6. provider agreements
7. artifacts and files

The system should retain enough metadata and checksums to detect missing artifacts even if binary storage experiences an incident.

---

# 27. Database Migrations

Database schema changes must be version-controlled.

A migration should:

- be deterministic
- be reviewable
- be tested
- have a rollback/recovery strategy where practical
- avoid destructive changes without explicit planning

Production migrations should not be performed manually by editing tables.

---

# 28. Safe Deployment

Deployments should follow:

```text id="9r0w7c"
Code
 ↓
Tests
 ↓
Build
 ↓
Migration validation
 ↓
Deploy
 ↓
Health check
 ↓
Monitor
```

A failed deployment should be detectable quickly.

For risky changes, deployment should support rollback to a known-good application version.

Database changes should be designed so old and new application versions can coexist during a transition when necessary.

---

# 29. Testing Architecture

Testing should follow the same boundaries established by the architecture.

### Unit Tests

Test:

- domain rules
- contract validation
- payment policy
- state transitions
- authorization
- verification rules

### Integration Tests

Test:

- PostgreSQL persistence
- worker jobs
- outbox behavior
- API/application services
- adapters

### External Sandbox Tests

Test:

- PayPal sandbox
- AI provider integration
- object storage

### End-to-End Tests

Test the actual user workflow:

```text id="4s7n1k"
Create Task
    ↓
Create Contract
    ↓
Approve
    ↓
Select Provider
    ↓
Authorize Payment
    ↓
Submit Work
    ↓
Fail Verification
    ↓
Revise
    ↓
Pass Verification
    ↓
Capture Payment
```

This end-to-end scenario is particularly valuable for the hackathon demo.

---

# 30. Critical Invariant Tests

Some tests should exist specifically to prove WorkPay's core safety model.

### Test 1 — AI cannot capture directly

Attempting to call payment execution without policy authorization must fail.

### Test 2 — Failed verification cannot release payment

```text
verification = FAIL
capture = DENIED
```

### Test 3 — Uncertain verification cannot release payment

```text
verification = UNCERTAIN
capture = DENIED
```

### Test 4 — Scope changes require amendment

Changing a material contract requirement invalidates the previous economic agreement.

### Test 5 — Duplicate capture is prevented

Repeated capture requests result in one external payment.

### Test 6 — Unauthorized user cannot access another task

Object-level authorization must deny the request.

### Test 7 — Provider cannot modify contract authority

Provider input cannot increase budget or redefine acceptance.

### Test 8 — Crash recovery does not duplicate payment

A simulated failure between request and response must reconcile safely.

These tests demonstrate the actual innovation of WorkPay better than simple CRUD tests.

---

# 31. Performance and Scaling

The MVP does not require sophisticated horizontal scaling.

The architecture should nevertheless avoid obvious bottlenecks.

The primary scalable boundaries are:

```text id="0sp2ap"
Web/API
Worker
PostgreSQL
Object Storage
```

If traffic increases:

- application instances can scale horizontally
- workers can scale horizontally
- PostgreSQL can be optimized/expanded
- object storage scales independently

The domain architecture should remain unchanged.

---

# 32. Concurrency Controls

Important state transitions must remain safe when multiple workers or requests operate simultaneously.

Examples:

```text id="3s4t8k"
Two capture jobs
       ↓
same payment
       ↓
database/idempotency protection
       ↓
one valid capture
```

Likewise:

```text id="8g6s2n"
Two provider submissions
       ↓
versioned submissions
       ↓
one authoritative state transition
```

Concurrency rules belong to the domain/persistence architecture, while Component 18 ensures the deployed runtime does not undermine them.

---

# 33. Operational Kill Switches

Because WorkPay can move real money, production should have emergency controls.

Examples:

```text id="5n7q1z"
Disable new payment captures
Pause agent execution
Disable provider onboarding
Disable new task creation
```

These controls should be implemented as explicit backend operational state, not by changing frontend buttons.

For example:

```text id="9k3m1p"
SYSTEM_PAYMENT_PAUSE = true
```

would cause payment policy/execution to fail safely.

The browser should reflect the resulting operational state.

---

# 34. Economic Safety Limits

Production should enforce system-level ceilings in addition to per-task authority.

Examples:

```text id="6q2x8r"
Maximum payment per task
Maximum aggregate daily payment
Maximum provider exposure
Maximum agent actions per task
Maximum negotiation rounds
```

These are defense-in-depth controls.

A compromised agent should not be able to cause unlimited economic damage.

---

# 35. Incident Response

An incident involving money requires a clear sequence.

Example:

```text id="1z4m8s"
Detect
  ↓
Contain
  ↓
Pause affected operation
  ↓
Preserve evidence
  ↓
Determine actual external state
  ↓
Correct internal state
  ↓
Resume safely
  ↓
Review root cause
```

Do not immediately delete or rewrite suspicious records.

Historical evidence is required to understand what happened.

---

# 36. Production Readiness Checklist

Before enabling real PayPal transactions:

### Security

- authentication enabled
- object-level authorization tested
- secrets protected
- HTTPS enabled
- webhook verification enabled
- rate limiting enabled
- file upload controls enabled

### Financial Safety

- payment policy enforced
- idempotency implemented
- reconciliation implemented
- capture requires verification PASS
- payment limits configured
- emergency payment pause available

### Reliability

- database backups enabled
- restore procedure tested
- worker retry policy implemented
- stale-job recovery implemented
- external timeouts implemented

### Observability

- structured logs
- correlation IDs
- payment monitoring
- worker monitoring
- error reporting
- operational alerts

### Product

- contract approval visible
- payment status visible
- verification results visible
- human review path available
- activity timeline working

---

# 37. MVP Infrastructure

The MVP should deliberately stay small.

A reasonable production topology is:

```text id="5k7z3q"
                Internet
                   │
             HTTPS / CDN
                   │
          ┌────────▼────────┐
          │ Web Application │
          └───────┬─────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
   PostgreSQL   Worker   Object Storage
        │
   Outbox / Jobs
```

External:

```text id="4n7w2a"
             ┌─────────────┐
             │   PayPal    │
             └─────────────┘
                    │
             ┌─────────────┐
             │ AI Provider │
             └─────────────┘
```

This can be deployed using managed infrastructure rather than maintaining servers manually.

The specific cloud provider is an implementation choice and should not change the architecture.

---

# 38. What Component 18 Must Never Do

Operations infrastructure must never become a substitute for application policy.

It must not:

- bypass authorization
- manually modify financial records as a normal workflow
- force payment outside the payment policy
- delete evidence to resolve an incident
- allow infrastructure administrators to casually rewrite domain state
- expose production secrets
- treat logs as authoritative domain state
- rely exclusively on frontend controls
- make deployment architecture dictate domain architecture

Operational access should be powerful but controlled and auditable.

---

# 39. Final Architecture Guarantee

With Component 18 in place, WorkPay has an operational architecture capable of safely running the complete workflow in production.

The system can:

- run as a modular monolith
- process long-running agent workflows asynchronously
- survive external service failures
- recover unfinished work
- reconcile uncertain payment states
- protect secrets
- restrict agent authority
- detect operational failures
- restore authoritative state
- audit economically significant actions
- deploy and evolve the system safely

Most importantly, operational failure does not become economic corruption.

A crash should result in:

> **“We need to recover and reconcile.”**

not:

> **“We don't know whether the money moved.”**

---

# 40. Architecture Invariants

The completed system should preserve these global invariants:

1. **PostgreSQL is the authoritative domain state.**
2. **The browser is never authoritative.**
3. **AI is never payment authority.**
4. **External providers are never WorkPay's source of truth.**
5. **Payment requires deterministic policy authorization.**
6. **Verification PASS is required before automatic capture.**
7. **UNCERTAIN never automatically releases payment.**
8. **Material contract changes create new versions.**
9. **Financial operations are idempotent.**
10. **External failures are reconciled rather than guessed.**
11. **Every important economic decision is traceable.**
12. **Every actor operates within explicit authority.**
13. **Untrusted content cannot redefine system instructions.**
14. **Long-running work is durable and recoverable.**
15. **Human intervention cannot silently bypass the same safety boundaries.**
16. **Operational controls fail closed for irreversible economic actions.**

---

# 41. Final Boundary

> **Component 18 makes WorkPay deployable, secure, observable, recoverable, and operationally controllable. It protects the system around the domain without becoming another business-logic layer.**

# Architecture Completion

With Components 1–18 complete, the architecture now has a coherent boundary structure:

```text id="9p2s7w"
                    USER
                     │
                     ▼
          ┌─────────────────────┐
          │ 16. Frontend / UX  │
          └──────────┬──────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │ 15. Application API │
          └──────────┬──────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
  Domain Workflow          13. Identity /
  Components 1–12          Authority
        │
        ▼
  14. Persistence
        │
        ▼
  17. External Integrations
        │
   ┌────┼─────┐
   ▼    ▼     ▼
PayPal  AI  Storage

        +
        
  18. Deployment,
  Security & Operations
```

The architecture should now **stop growing**. The next useful artifact is not Component 19.

It is the **final architecture synthesis**: one implementation-oriented document that collapses these 18 components into the actual WorkPay system—its services/modules, database, APIs, workflows, deployment topology, and end-to-end request/event flows.