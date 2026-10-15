# Component 15 — Application API & Interface Boundary

## 1. Responsibility

The Application API is the boundary through which the web application, provider portal, and other trusted clients interact with WorkPay.

Its responsibility is:

> **Translate external requests into authorized application operations and return stable, product-oriented responses without exposing internal domain or persistence details.**

This component owns:

- HTTP/API endpoints
- request validation
- response contracts
- authentication integration
- authorization integration
- idempotency at the API boundary
- pagination
- file-upload/download initiation
- realtime task updates
- correlation/request IDs
- API error handling
- rate limiting
- API versioning

It does **not** own:

- business decisions
- payment policy
- contract interpretation
- provider ranking
- verification
- database logic
- PayPal integration
- AI reasoning

The API is an **interface**, not the business engine.

---

# 2. Core Principle

The browser should never communicate directly with internal domain services or the database.

The boundary is:

```text
Browser
   │
   ▼
HTTP API
   │
   ├── Authentication
   ├── Authorization
   ├── Validation
   └── Application Service
           │
           ▼
       Domain Logic
           │
           ▼
      Persistence
```

For example, the browser should not send:

```text
UPDATE payment SET status = CAPTURED
```

It should send an application request such as:

```text
POST /api/tasks/{taskId}/payments/{paymentId}/release
```

The API passes the request into the appropriate application/domain workflow, where policy determines whether the operation is actually permitted.

---

# 3. API Style

For the MVP:

> **Use a REST-style JSON API.**

There is no need for GraphQL.

The API should be resource-oriented and predictable.

Examples:

```text
GET    /api/tasks
POST   /api/tasks

GET    /api/tasks/:taskId
POST   /api/tasks/:taskId/cancel

GET    /api/tasks/:taskId/contract
POST   /api/tasks/:taskId/contract/approve

GET    /api/tasks/:taskId/providers
POST   /api/tasks/:taskId/provider-selection

GET    /api/tasks/:taskId/negotiation
POST   /api/tasks/:taskId/negotiation/offers

GET    /api/tasks/:taskId/payment
GET    /api/tasks/:taskId/activity

POST   /api/tasks/:taskId/disputes
```

The exact endpoint set should follow actual product workflows rather than attempting to expose every database table.

---

# 4. API Is Not a Mirror of the Database

Do not create an endpoint for every table simply because a table exists.

Bad architecture:

```text
GET /api/work_contracts
GET /api/contract_requirements
GET /api/contract_scope_items
GET /api/payment_policy_checks
GET /api/outbox_events
```

This leaks internal implementation.

Instead, expose product concepts:

```text
GET /api/tasks/:taskId
GET /api/tasks/:taskId/contract
GET /api/tasks/:taskId/payment
GET /api/tasks/:taskId/activity
```

The API response should represent what the client actually needs.

---

# 5. Request Lifecycle

Every authenticated request follows approximately:

```text
HTTP Request
     │
     ▼
Request ID / Correlation ID
     │
     ▼
Authentication
     │
     ▼
Authorization
     │
     ▼
Request Validation
     │
     ▼
Application Service
     │
     ▼
Domain / Policy Logic
     │
     ▼
Persistence / External Adapter
     │
     ▼
Response
```

The ordering is important.

A request should not reach business logic before the caller is authenticated and authorized.

---

# 6. Authentication

Authentication is handled by the identity/session mechanism established in Component 13.

The API receives the authenticated identity from the session/token.

It must never trust:

```json
{
  "userId": "user_123"
}
```

simply because the browser supplied it.

The server determines:

```text
authenticatedActor.id
```

from the authenticated session.

If a request says:

```text
taskId = task_123
```

the API then verifies that the authenticated actor may access `task_123`.

---

# 7. Authorization

Authentication answers:

> Who is this?

Authorization answers:

> Is this actor allowed to perform this operation on this resource?

For example:

```text
POST /api/tasks/task_123/contract/approve
```

must check:

```text
1. User authenticated
2. User owns task_123
3. Contract belongs to task_123
4. Contract is awaiting approval
5. Contract version is still valid
6. User has contract-approval permission
```

The API invokes Component 13's authorization system rather than implementing ad-hoc permission checks throughout controllers.

---

# 8. Resource Ownership

Object-level authorization is mandatory.

This request:

```text
GET /api/tasks/task_999
```

must not return anything merely because:

```text
task_999
```

is a valid ID.

The API must establish:

```text
authenticated user
        ↓
owns/accesses task_999
        ↓
allowed
```

This protects against horizontal privilege escalation.

---

# 9. Request Validation

Every API request is untrusted input.

Validate:

- required fields
- data types
- lengths
- enum values
- dates
- monetary values
- file references
- IDs
- pagination parameters
- request body size

For example:

```typescript
type CreateTaskRequest = {
  description: string;
  budget?: {
    amountMinor: number;
    currency: string;
  };
  deadline?: string;
};
```

The API should reject malformed input before invoking the application service.

---

# 10. Business Validation Is Different

Schema validation is not business validation.

For example:

```text
budget.amountMinor = 15000
```

may be structurally valid.

But whether:

```text
$150
```

is allowed for a particular task is a domain decision.

Therefore:

```text
API validation
    ↓
"Is this request well formed?"

Domain validation
    ↓
"Is this operation valid?"
```

These responsibilities should remain separate.

---

# 11. Response Model

API responses should expose stable product-level objects.

Example:

```json
{
  "id": "task_123",
  "status": "VERIFYING",
  "objective": "Clean 5,000 customer records",
  "budget": {
    "amountMinor": 15000,
    "currency": "USD"
  },
  "payment": {
    "status": "AUTHORIZED",
    "amount": {
      "amountMinor": 13500,
      "currency": "USD"
    }
  },
  "verification": {
    "status": "IN_PROGRESS"
  }
}
```

The client should not need to know:

- database table names
- internal IDs for every related record
- worker implementation
- PayPal API payload structure
- LLM provider response format

---

# 12. API Error Model

Errors should have a consistent structure.

For example:

```json
{
  "error": {
    "code": "CONTRACT_NOT_APPROVABLE",
    "message": "This contract is no longer awaiting approval.",
    "requestId": "req_123"
  }
}
```

Use stable machine-readable error codes.

Examples:

```text
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND
VALIDATION_FAILED
INVALID_STATE_TRANSITION
CONTRACT_VERSION_CONFLICT
PAYMENT_NOT_ELIGIBLE
TASK_ALREADY_CANCELLED
IDEMPOTENCY_CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

Do not expose stack traces or internal infrastructure details.

---

# 13. HTTP Status Codes

Use normal HTTP semantics.

Examples:

```text
200 OK
201 Created
202 Accepted
204 No Content

400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

`409 Conflict` is particularly useful for:

- stale contract versions
- concurrent state changes
- idempotency conflicts
- invalid workflow transitions caused by current state

---

# 14. Long-Running Operations

AI planning and verification should not require an HTTP request to remain open.

Instead:

```text
POST /api/tasks/task_123/plan
```

can return:

```http
202 Accepted
```

with:

```json
{
  "taskId": "task_123",
  "status": "PLANNING"
}
```

The operation continues through the worker system.

The client can then observe the task through:

```text
GET /api/tasks/task_123
```

or realtime updates.

---

# 15. Realtime Updates

The product benefits from realtime state changes.

For example:

```text
Agent selected provider
Payment authorized
Provider submitted work
Verification completed
Payment captured
```

The browser should not continuously poll every second.

For the MVP, use:

> **Server-Sent Events (SSE)**

for task/activity updates.

Conceptually:

```text
Domain Event
     ↓
Event Consumer
     ↓
Realtime Publisher
     ↓
SSE connection
     ↓
Browser
```

The browser receives events such as:

```text
TASK_STATUS_CHANGED
VERIFICATION_COMPLETED
PAYMENT_AUTHORIZED
PAYMENT_CAPTURED
CASE_OPENED
```

The event itself should not be treated as authority. The client can refresh/read the authoritative resource when necessary.

---

# 16. Realtime Connection

Conceptually:

```text
GET /api/tasks/:taskId/events
```

opens an SSE stream.

The server verifies:

```text
authenticated user
        ↓
access to task
        ↓
subscribe
```

A user cannot subscribe to another user's task simply by changing the task ID.

---

# 17. API and Events

The API should not manually manufacture activity state.

For example:

```text
Payment Service
      ↓
payment state changed
      ↓
domain event
      ↓
event consumers
      ├── Activity
      ├── Notifications
      └── Realtime
```

This prevents multiple systems from inventing conflicting representations of the same event.

---

# 18. Idempotency at the API Boundary

Commands that can produce economic or durable side effects should support idempotency.

The client can send:

```http
Idempotency-Key: 01JXYZ...
```

For example:

```text
POST /api/tasks/task_123/contract/approve
```

If the browser retries because of a network timeout, WorkPay should recognize the same operation rather than performing approval twice.

The idempotency record belongs to the persistence layer described in Component 14.

---

# 19. Idempotency Conflicts

If the same key is reused with a materially different request:

```text
Request A
key = abc
body = contract_version_1

Request B
key = abc
body = contract_version_2
```

the API must reject it.

For example:

```text
409 IDEMPOTENCY_CONFLICT
```

The key represents a particular operation, not a reusable session token.

---

# 20. Pagination

Collection endpoints should be paginated.

For example:

```text
GET /api/tasks?limit=20&cursor=...
```

Response:

```json
{
  "items": [],
  "nextCursor": "..."
}
```

This applies to:

- tasks
- activity
- cases
- submissions
- provider work
- notifications
- messages

Do not return unlimited historical records.

---

# 21. File Upload Boundary

Files should not normally be uploaded by sending large binary bodies through the application server.

Instead:

```text
Browser
   │
   ▼
API
   │
   ├── authenticate
   ├── authorize
   └── request upload
          │
          ▼
   signed upload URL
          │
          ▼
    Object Storage
```

The API records the intended file relationship.

The browser then uploads directly to object storage using a short-lived signed URL.

This reduces load on the application server.

---

# 22. File Download Boundary

Downloads follow the same principle.

```text
Browser
   │
   ▼
GET /api/files/:fileId
   │
   ▼
Authorization
   │
   ▼
Generate short-lived signed URL
   │
   ▼
Object Storage
```

The browser should not receive permanent public storage URLs.

A file's existence in storage does not imply that the current user is authorized to access it.

---

# 23. File Access Rules

The API checks the domain relationship before generating access.

For example:

```text
Buyer
 ↓
Task
 ↓
Task Input File
```

The buyer may access it.

A provider assigned to the task may receive only the files required by the contract.

A provider should not automatically receive:

```text
all files belonging to the buyer
```

or unrelated task files.

---

# 24. Provider API

The provider portal uses the same API boundary but a different actor.

Examples:

```text
GET  /api/provider/work
GET  /api/provider/work/:executionId
POST /api/provider/work/:executionId/accept
POST /api/provider/work/:executionId/submit
POST /api/provider/work/:executionId/clarifications
```

The API derives provider identity from authentication.

The provider does not submit:

```json
{
  "providerId": "provider_123"
}
```

as an authority claim.

---

# 25. Buyer API vs Provider API

The underlying domain services remain shared.

For example:

```text
Buyer Portal
      │
      ▼
Application API
      │
      ▼
Task / Contract Services
```

and:

```text
Provider Portal
      │
      ▼
Application API
      │
      ▼
Execution / Submission Services
```

The distinction is primarily:

```text
actor
+
permissions
+
resource visibility
```

not separate backend systems.

---

# 26. API and Payment Security

The browser must never receive:

- PayPal client secrets
- PayPal private credentials
- internal payment credentials
- unrestricted payment commands

The browser can request:

```text
"show me my payment"
```

or:

```text
"perform this user-authorized action"
```

but the actual financial decision remains inside the domain/policy layers.

The API cannot bypass those layers.

---

# 27. API and AI Security

The API must never expose arbitrary internal tools to the browser.

Likewise, an AI-generated API request is still treated as untrusted input.

For example:

```text
AI proposes:
capture payment_123
```

does not mean:

```text
POST /capture
```

should automatically execute it.

The request still passes through:

```text
Authorization
      ↓
Domain Validation
      ↓
Payment Policy
      ↓
Payment Service
```

---

# 28. Rate Limiting

Rate limiting should exist at the API boundary.

Apply sensible limits to:

- login/session endpoints
- task creation
- file-upload initialization
- provider submission
- clarification messages
- case messages
- expensive operations

Especially protect expensive operations such as:

```text
AI planning
verification
provider search
```

A user or compromised account should not be able to generate unlimited AI or external-service costs.

---

# 29. Request Size Limits

The API should enforce request limits.

For example:

```text
JSON request → relatively small
File upload → object storage
```

Large files should not be accepted as unlimited HTTP bodies.

Text fields should also have maximum lengths.

This protects the API from accidental or malicious resource exhaustion.

---

# 30. Correlation IDs

Every request should have a correlation/request ID.

Example:

```text
X-Request-ID: req_01J...
```

That identifier should flow through:

```text
API
 ↓
Application Service
 ↓
Domain Service
 ↓
Job
 ↓
External Integration
 ↓
Logs / Audit
```

This allows an operator to investigate:

> What happened to the request that started this workflow?

The correlation ID is operational metadata, not business state.

---

# 31. API Versioning

The API should have a stable version boundary.

For the MVP:

```text
/api/v1/...
```

is sufficient.

Avoid premature version proliferation.

The important principle is:

> Once external clients depend on an API contract, changes should be deliberate and backward-compatible where practical.

---

# 32. API Security Headers

The web application/API should use normal web security protections, including:

- HTTPS
- secure cookies where applicable
- appropriate CORS policy
- CSRF protection where cookie-based authentication requires it
- content-type validation
- security headers
- request size limits

These are implementation-level controls rather than separate architectural components.

---

# 33. No Direct Database Access

Neither:

```text
Browser
```

nor:

```text
LLM
```

nor:

```text
Provider
```

should ever have direct database access.

Only backend persistence modules communicate with PostgreSQL.

```text
Browser
   ✗
   │
   X
PostgreSQL

Browser
   ↓
API
   ↓
Application
   ↓
Persistence
   ↓
PostgreSQL
```

This is non-negotiable.

---

# 34. API Layering

A clean implementation can use:

```text
backend/
├── api/
│   ├── routes/
│   ├── schemas/
│   ├── middleware/
│   └── errors/
│
├── application/
│   ├── tasks/
│   ├── contracts/
│   ├── payments/
│   └── execution/
│
├── domain/
│
└── persistence/
```

The API layer should remain thin.

A route handler should generally look conceptually like:

```text
parse request
      ↓
authenticate
      ↓
authorize
      ↓
validate
      ↓
call application service
      ↓
map result to response
```

It should not contain 300 lines of business logic.

---

# 35. Example: Contract Approval

Request:

```text
POST /api/v1/tasks/task_123/contract/approve
```

Flow:

```text
Browser
   ↓
API
   ↓
authenticate user
   ↓
authorize task
   ↓
validate contract version
   ↓
ApproveContractService
   ↓
Contract Domain
   ↓
Persistence transaction
   ↓
CONTRACT_APPROVED
   ↓
response
```

Response:

```json
{
  "taskId": "task_123",
  "contractVersion": 1,
  "status": "ACTIVE"
}
```

The browser does not need to know how the database transaction or event outbox works.

---

# 36. Example: Provider Submission

Request:

```text
POST /api/v1/executions/execution_123/submissions
```

The API:

```text
1. authenticates provider
2. verifies provider owns execution
3. validates execution state
4. validates submission metadata
5. creates upload instructions if necessary
6. calls submission service
7. persists submission
8. returns submission state
```

It does not determine whether the work is acceptable.

That belongs to verification.

---

# 37. Example: Payment Status

Request:

```text
GET /api/v1/tasks/task_123/payment
```

The API returns the current WorkPay payment state:

```json
{
  "status": "AUTHORIZED",
  "amount": {
    "amountMinor": 13500,
    "currency": "USD"
  },
  "releaseStatus": "BLOCKED_PENDING_VERIFICATION"
}
```

It should not simply expose raw PayPal API responses.

The API represents the WorkPay domain.

---

# 38. API and External Webhooks

External systems such as PayPal have a separate inbound boundary:

```text
PayPal
   ↓
/api/v1/webhooks/paypal
   ↓
Webhook validation
   ↓
Idempotency
   ↓
Payment reconciliation
   ↓
Domain event
```

The webhook endpoint is not treated like an ordinary browser endpoint.

It must:

- verify authenticity
- validate payload structure
- deduplicate events
- persist the relevant external event
- reconcile internal state

The webhook does not directly modify arbitrary database state.

---

# 39. What This Component Must Never Do

The API must never:

- directly manipulate database tables from controllers
- authorize payments on its own
- bypass payment policy
- decide verification results
- let the browser change immutable contracts
- trust client-supplied ownership
- expose PayPal secrets
- expose internal AI prompts or chain-of-thought
- expose arbitrary database queries
- treat an AI request as inherently trusted
- contain the core business workflow itself

---

# 40. MVP Implementation

Keep the API intentionally simple:

```text
Next.js / Web Client
        │
        ▼
REST API
        │
        ├── Auth middleware
        ├── Authorization
        ├── Validation
        ├── Rate limiting
        └── Application Services
                │
                ▼
             Domain
                │
                ▼
           Persistence
```

For realtime:

```text
Domain Events
      ↓
SSE
      ↓
Browser
```

For files:

```text
API
 ↓
signed URL
 ↓
Object Storage
```

There is no need for:

```text
GraphQL
API gateway cluster
service mesh
multiple frontend backends
separate BFF services
```

for the MVP.

---

# 41. Final Guarantee

The Application API guarantees:

> **Every interaction with WorkPay passes through a controlled, authenticated, authorized, validated interface while keeping domain logic and persistence details behind the application boundary.**

The resulting boundary is:

```text
                 CLIENTS
              /           \
       Buyer Web       Provider Web
              \           /
               \         /
                ▼       ▼
                 API
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
     Auth      Validate   Authorize
        │         │         │
        └─────────┼─────────┘
                  ▼
          Application Services
                  │
                  ▼
             Domain Logic
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   Persistence  Policies  Adapters
```

**Component 15 boundary:**

> **Component 15 is the controlled doorway into WorkPay. It accepts requests from clients, establishes identity and authorization, validates input, invokes the appropriate application workflow, and exposes stable product-level responses. It does not decide business outcomes itself.**