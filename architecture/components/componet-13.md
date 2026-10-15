# Component 13 — Identity, Access Control & Authority Boundaries

## 1. Responsibility

The **Identity & Access Control layer** determines:

> **Who is making a request, what role they have, what resources they are allowed to access, and whether the requested operation is within their authority.**

This component protects every other component.

It establishes the security boundary between:

```text
Buyer
Provider
Reviewer
Agent
System
PayPal
```

The system must never rely on the AI, browser, or client application to determine authority.

---

# 2. Why This Component Matters

WorkPay has multiple actors.

A single task may involve:

```text
Buyer
   │
   ├── creates task
   ├── approves contract
   └── controls budget

AI Agent
   │
   ├── selects provider
   ├── negotiates
   └── coordinates work

Provider
   │
   ├── sees assigned work
   ├── submits deliverable
   └── sees payment status

Reviewer
   │
   ├── handles disputes
   └── resolves uncertainty

PayPal
   │
   └── settles money
```

These actors must not have interchangeable permissions.

For example:

> A provider must never be able to call `GET /tasks` and receive every buyer's tasks.

Likewise:

> A buyer must not be able to submit work on behalf of a provider.

And:

> The AI must not be treated as a normal user with unrestricted permissions.

---

# 3. Core Principle

The architecture separates:

### Authentication

> Who are you?

### Authorization

> What are you allowed to do?

### Ownership

> Which resources belong to you?

### Authority

> Are you permitted to perform this particular economic action?

These are different concepts.

A user being authenticated does not automatically mean they can perform an operation.

---

# 4. Actor Model

The system recognizes several actor types.

```typescript id="z4g2mp"
type ActorType =
  | "BUYER"
  | "PROVIDER"
  | "REVIEWER"
  | "AGENT"
  | "SYSTEM";
```

External systems such as PayPal are represented separately:

```typescript id="e7m8qa"
type ExternalActor =
  | "PAYPAL"
  | "STORAGE_PROVIDER"
  | "AI_PROVIDER";
```

This distinction matters for auditing.

---

# 5. User Identity

A user account should contain only identity and account-level information.

```typescript id="x3q7vp"
type User = {
  id: string;

  email: string;

  name: string;

  status:
    | "ACTIVE"
    | "SUSPENDED"
    | "DEACTIVATED";

  createdAt: string;

  updatedAt: string;
};
```

Do not put authorization logic directly into the user object.

---

# 6. Roles

For the MVP, use a small number of roles.

```typescript id="j5w9kc"
type Role =
  | "BUYER"
  | "PROVIDER"
  | "REVIEWER"
  | "ADMIN";
```

Avoid creating dozens of roles.

The important distinction is not role count.

It is **resource-level authorization**.

---

# 7. Buyer Permissions

A buyer may:

```text id="g3m1rx"
CREATE_TASK
VIEW_OWN_TASK
UPLOAD_TASK_FILE
CREATE_CLARIFICATION
APPROVE_CONTRACT
CANCEL_OWN_TASK
VIEW_OWN_PAYMENT
OPEN_DISPUTE
VIEW_OWN_ACTIVITY
```

A buyer cannot:

```text id="w8k4s2"
VIEW_OTHER_BUYER_TASK
MODIFY_PROVIDER_SUBMISSION
OVERRIDE_VERIFICATION
DIRECTLY_CAPTURE_PAYMENT
MODIFY_PAYPAL_TRANSACTION
```

---

# 8. Provider Permissions

A provider may:

```text id="a9c6m1"
VIEW_ASSIGNED_WORK
ACCEPT_WORK
REQUEST_CLARIFICATION
UPLOAD_DELIVERABLE
SUBMIT_WORK
VIEW_OWN_PAYMENT
RESPOND_TO_CASE
```

A provider cannot:

```text id="p5t2y7"
VIEW_OTHER_PROVIDER_WORK
MODIFY_CONTRACT
CHANGE_BUDGET
RELEASE_PAYMENT
VIEW_BUYER_PRIVATE_DATA
OVERRIDE_VERIFICATION
```

---

# 9. Reviewer Permissions

A reviewer may:

```text id="r6v3k8"
VIEW_CASE
VIEW_CASE_EVIDENCE
REQUEST_INFORMATION
RESOLVE_DISPUTE
OVERRIDE_VERIFICATION
APPROVE_CONTRACT_AMENDMENT
APPROVE_REFUND
APPROVE_PAYMENT_RELEASE
```

But reviewer permissions should themselves be bounded.

For example:

```text id="n2w8q5"
Reviewer A:
maximum financial authority = $500

Reviewer B:
maximum financial authority = $5,000
```

Even humans should not have unlimited economic authority.

---

# 10. Agent Identity

The AI agent needs an identity, but it should not be treated as a superuser.

For example:

```typescript id="q8m3k1"
type AgentIdentity = {
  id: string;

  taskId: string;

  userId: string;

  authorityPolicyId: string;

  status:
    | "ACTIVE"
    | "PAUSED"
    | "REVOKED";
};
```

The agent operates **on behalf of a user**, within the authority granted to it.

Conceptually:

```text id="b6y4n7"
User
  │
  │ grants bounded authority
  ▼
Agent
  │
  │ operates within contract
  ▼
Domain Services
```

---

# 11. Agent Authority Is Task-Scoped

This is extremely important.

The agent should not receive:

```text id="w7k1r2"
"Access to all of user's PayPal account."
```

Instead:

```text id="f4n8z3"
Agent
 └── Task 1842
      ├── maximum spend: $150
      ├── currency: USD
      ├── provider selection: allowed
      ├── negotiation: allowed
      ├── scope modification: prohibited
      └── approval threshold: $150
```

Authority is scoped to the task.

---

# 12. Resource Ownership

Every major resource should have ownership relationships.

For example:

```text id="x8p3v5"
Task
 └── user_id

Contract
 └── task_id

Payment
 └── task_id

Submission
 └── execution_id
      └── provider_id
```

Authorization can then follow these relationships.

Example:

```text id="g7m4q1"
Can buyer view payment?

payment.task.user_id === authenticatedUser.id
```

This is stronger than simply checking:

```text id="t2k9v6"
role === BUYER
```

---

# 13. Object-Level Authorization

This system needs **object-level authorization**, not merely role-based access control.

Bad:

```typescript id="k3q7m2"
if (user.role === "BUYER") {
    return task;
}
```

Correct:

```typescript id="m8z4r1"
if (
    user.role === "BUYER" &&
    task.userId === user.id
) {
    return task;
}
```

The second check prevents horizontal privilege escalation.

---

# 14. Provider Resource Access

Suppose provider A requests:

```text
GET /api/executions/execution_123
```

The backend must verify:

```text id="p1x8q6"
execution.providerId === authenticatedProvider.id
```

It must not rely on:

```text id="c9w3n7"
"the provider knows the execution ID"
```

IDs are not authorization.

---

# 15. Never Trust Browser-Supplied Identity

The browser should never be allowed to say:

```json id="6f1gq4"
{
  "userId": "user_123"
}
```

and have the backend trust it.

Instead:

```text id="q5m8t1"
Browser
  ↓
Authenticated Session
  ↓
Backend
  ↓
Authenticated Identity
  ↓
Authorization
```

The server derives identity from the authenticated session/token.

---

# 16. Authentication

For the web application, use a standard authentication mechanism.

The exact provider can vary.

The important architecture is:

```text id="z9r4k2"
Browser
   ↓
Login
   ↓
Identity Provider
   ↓
Authenticated Session
   ↓
Web Application
```

The application should not implement custom password cryptography for the hackathon.

Use a proven identity provider.

---

# 17. Session

A session represents the authenticated browser identity.

Conceptually:

```typescript id="u6x2p9"
type Session = {
  id: string;

  userId: string;

  expiresAt: string;

  createdAt: string;

  lastSeenAt: string;
};
```

The backend obtains:

```text id="r3m7c8"
authenticatedUserId
```

from the session.

---

# 18. API Request Pipeline

Every protected request should follow:

```text id="e8x1n4"
HTTP Request
      ↓
Authentication
      ↓
Identify Actor
      ↓
Authorization
      ↓
Resource Ownership
      ↓
Domain Validation
      ↓
Execute
```

For sensitive actions:

```text id="v5k2s7"
Authentication
      ↓
Authorization
      ↓
Policy Validation
      ↓
Domain Service
```

---

# 19. Authorization Is Not Business Policy

These must remain separate.

Authorization asks:

> “Is this actor allowed to request this operation?”

Payment policy asks:

> “Is this payment operation permitted under the active commercial agreement?”

Example:

A buyer may be authorized to request:

```text
CAPTURE_PAYMENT
```

but the payment policy may still say:

```text
DENY
```

because verification has failed.

Therefore:

```text id="b4w9q6"
Authorization
    ≠
Payment Policy
```

Both must pass.

---

# 20. Permission Model

Permissions can be represented explicitly.

```typescript id="h7q3m8"
type Permission =
  | "task:create"
  | "task:view"
  | "task:cancel"
  | "contract:view"
  | "contract:approve"
  | "provider:view"
  | "provider:select"
  | "work:view"
  | "work:submit"
  | "verification:view"
  | "case:view"
  | "case:resolve"
  | "payment:view"
  | "payment:request"
  | "payment:approve";
```

But permissions alone are not enough.

Resource scope must also be checked.

---

# 21. Authorization Service

Use a centralized authorization interface.

```typescript id="p8m4x1"
interface AuthorizationService {
  authorize(
    actor: Actor,
    action: string,
    resource: Resource
  ): Promise<AuthorizationDecision>;
}
```

Result:

```typescript id="k9v5s2"
type AuthorizationDecision = {
  allowed: boolean;

  reason: string;

  policyVersion: string;
};
```

Example:

```text id="n4x8c6"
Actor:
buyer_123

Action:
contract:approve

Resource:
contract_456

Result:
ALLOW

Reason:
Contract belongs to buyer's task.
```

---

# 22. Policy Evaluation

Authorization can use policies such as:

```text id="w2j7m9"
Buyer can approve contract
IF
contract.task.user_id == buyer.id
AND
contract.status == AWAITING_APPROVAL
```

Provider can submit work:

```text id="c8q4z1"
IF
execution.provider_id == provider.id
AND
execution.status IN (ACCEPTED, IN_PROGRESS)
```

Reviewer can resolve case:

```text id="y6m3v8"
IF
reviewer.role == REVIEWER
AND
case.status == UNDER_REVIEW
AND
reviewer has required authority
```

---

# 23. Sensitive Operations Need Multiple Gates

Consider payment capture.

The system should require:

```text id="j8r5k2"
1. Authenticated actor
2. Authorization
3. Valid payment state
4. Valid agreement
5. Verification PASS
6. No blocking case
7. Payment policy ALLOW
8. Idempotency check
```

Only then:

```text id="v3x7n9"
PayPal capture
```

This is defense in depth.

---

# 24. Agent Requests

The same architecture applies to the agent.

Suppose the agent requests:

```text id="h5k2q7"
SELECT_PROVIDER
```

The backend identifies:

```text id="s6m8x3"
actor.type = AGENT
actor.userId = buyer_123
actor.taskId = task_456
```

Then authorization checks:

```text id="w1q9p4"
Is this agent allowed to select a provider
for this task?
```

Then provider eligibility checks.

Then the action executes.

---

# 25. Agent Cannot Borrow User Authority

A major security rule:

> **User authority does not automatically transfer to the AI.**

The user may have:

```text id="k7c4n8"
full access to their account
```

while the agent has:

```text id="m2x9q5"
task-scoped authority
```

This prevents a compromised or misbehaving agent from acting across the entire account.

---

# 26. PayPal Credentials

PayPal credentials should never be:

```text id="d5f8q2"
stored in the browser
```

or:

```text id="r8m3k1"
provided to the LLM
```

They belong behind the payment adapter.

Conceptually:

```text id="v6x2p7"
Agent
  ↓
Payment Policy
  ↓
Payment Service
  ↓
PayPal Adapter
  ↓
PayPal credentials
```

Only the PayPal integration layer should interact with the credentials required for server-to-server payment operations.

---

# 27. Sensitive Data Separation

The agent should receive only the information it needs.

For example, the agent may need:

```text id="a3v8m6"
payment amount
currency
payment state
```

It does not need:

```text id="p7q2w9"
PayPal credentials
full account credentials
unrelated transaction history
```

This follows:

> **Least privilege.**

---

# 28. File Access Authorization

Files require their own authorization checks.

For example:

```text id="y8n4c2"
Task input file
```

may be accessible to:

```text
Buyer
Assigned Provider
Verification Engine
Authorized Agent
```

but not:

```text
Unrelated Provider
```

The object-storage key itself must never be treated as a permission.

---

# 29. Signed File URLs

When a user needs a file:

```text id="q5x8m1"
Browser
 ↓
GET /files/file_123
 ↓
Authorization check
 ↓
Generate short-lived signed URL
 ↓
Object storage
```

The signed URL should:

- expire
- be scoped to the specific object
- not grant bucket-wide access

---

# 30. Provider Data Isolation

Provider profiles may contain:

```text id="n7c3v9"
name
capabilities
pricing
availability
reputation
```

But private provider information should not be exposed unnecessarily.

The buyer may see:

```text id="t4m8q2"
Provider C
95% first-pass acceptance
6h estimated completion
$135
```

but not necessarily:

```text id="k6x1p8"
private contact details
internal risk flags
private account metadata
```

The UI should expose only data intended for that audience.

---

# 31. Buyer Data Isolation

Likewise, the provider may need:

```text id="r8q4m6"
task objective
requirements
input files
deadline
payment terms
```

but should not automatically receive:

```text id="f2n7x5"
buyer's unrelated tasks
private account information
unrelated transaction history
```

---

# 32. Reviewer Access

Reviewers need broad access for disputes, but even they should receive access through a controlled review interface.

Instead of:

```text id="q8c2m5"
SELECT * FROM database
```

the system constructs:

```text id="p6x4n9"
Case Evidence Bundle
```

containing exactly what is relevant to the case.

This creates both security and usability benefits.

---

# 33. Audit of Authorization

Every sensitive authorization decision should be auditable.

```typescript id="m7z4c1"
type AuthorizationAudit = {
  id: string;

  actorType: string;

  actorId: string;

  action: string;

  resourceType: string;

  resourceId: string;

  result: "ALLOW" | "DENY";

  reason: string;

  policyVersion: string;

  createdAt: string;
};
```

Example:

```text id="b5n8q2"
AGENT
agent_123

ACTION
payment:request

RESOURCE
payment_456

RESULT
ALLOW

POLICY
agent-authority-v1
```

---

# 34. Failed Authorization Must Be Observable

A denied action should not simply disappear.

Example:

```text id="x4m7p9"
Agent attempted:
CHANGE_BUDGET

Result:
DENIED

Reason:
Agent authority prohibits budget modification.
```

For normal operation, this can remain internal.

For important events, the user may see:

> “The agent requested a budget change, but your authority settings prevented it.”

This increases trust.

---

# 35. Security Events

Some authorization failures should generate security events.

Examples:

```text id="v8c3m5"
Repeated access to another user's task
Repeated payment authorization attempts
Provider attempting buyer-only operation
Agent attempting prohibited financial action
Suspicious file access
```

These can produce:

```text id="q2n6x8"
SECURITY_EVENT
```

and potentially:

```text id="j5r9k3"
CASE_OPENED
```

---

# 36. Account Suspension

If a user or provider is suspended:

```text id="h4q7m2"
ACTIVE
  ↓
SUSPENDED
```

New operations should be blocked.

Existing financial obligations need separate handling.

For example:

```text id="c8w3p6"
Provider suspended
```

does not automatically mean:

```text id="z6n1x5"
authorized payment is refunded
```

The payment and dispute policies determine what happens.

---

# 37. Revoking Agent Authority

The user should be able to disable the agent.

Settings:

```text id="x9m4q2"
AI Agent

Status: Active

[ Pause Agent ]

Authority:
Maximum per task: $150
Daily maximum: $500
Scope changes: Never
Provider selection: Allowed
Negotiation: Allowed
```

If the user revokes authority:

```text id="p5k8v1"
agent.status = REVOKED
```

The orchestrator must stop starting new autonomous actions.

Existing operations are handled according to their domain state.

---

# 38. Authority Versioning

Agent authority should be versioned.

```typescript id="n3x7q5"
type AuthorityPolicy = {
  id: string;

  version: number;

  userId: string;

  maxSpendPerTask: Money;

  maxSpendPerDay: Money;

  allowedCurrencies: string[];

  allowedActions: string[];

  prohibitedActions: string[];

  requiresApprovalAbove: Money;

  createdAt: string;
};
```

A task records the authority policy version under which it was approved.

This matters for auditing.

---

# 39. Authority Cannot Retroactively Rewrite History

Suppose:

```text id="k6p2w8"
Authority v1:
max = $150
```

A user later changes it:

```text id="y4m9c3"
Authority v2:
max = $300
```

The system must not reinterpret old transactions as if they were authorized under v2.

Historical decisions remain tied to:

```text id="q8x5n1"
authority policy version
```

This preserves auditability.

---

# 40. Approval Records

Human approvals should be explicit objects.

For example:

```typescript id="w3m7k2"
type Approval = {
  id: string;

  type:
    | "CONTRACT"
    | "PAYMENT"
    | "AMENDMENT"
    | "DISPUTE_RESOLUTION";

  resourceId: string;

  actorId: string;

  policyVersion: string;

  resourceVersion: number;

  resourceHash: string;

  approvedAt: string;
};
```

This prevents ambiguity about what exactly someone approved.

---

# 41. Approval Must Bind to a Version

A user approving:

```text id="r5q8x3"
Contract v1
```

does not automatically approve:

```text id="u2m7p9"
Contract v2
```

If the contract changes materially:

```text id="g4n6k1"
v1
 ↓
amendment
 ↓
v2
 ↓
new approval
```

This follows directly from the immutable contract architecture.

---

# 42. API Security

Every API endpoint should define:

```text id="c7m2x9"
Authentication requirement
Authorization requirement
Resource ownership requirement
State requirement
Input validation
Rate limit
Audit requirement
```

Example:

```text id="v9q4k6"
POST /tasks/:taskId/contracts/:contractId/approve
```

requires:

```text
authenticated user
AND
user owns task
AND
contract belongs to task
AND
contract status = AWAITING_APPROVAL
AND
contract version is current
```

---

# 43. API Input Validation

Authorization happens before trusting user-controlled identifiers.

Inputs such as:

```text id="k2p8m4"
taskId
contractId
paymentId
providerId
```

must be treated as untrusted.

The backend resolves them against authorized resources.

Never assume:

```text id="s6n3x7"
taskId + userId
```

are valid merely because they were supplied together.

---

# 44. Rate Limiting

Rate limiting is useful for:

```text id="m8q2c5"
login
task creation
file upload
provider search
negotiation actions
case messages
```

Especially:

```text id="v3x7p1"
AI-triggered endpoints
```

because an agent loop could otherwise accidentally generate excessive requests.

---

# 45. Agent-Specific Rate Limits

The agent should have execution budgets:

```text id="n6c9k2"
maximum model calls
maximum tool calls
maximum negotiation rounds
maximum provider searches
maximum workflow runtime
```

These complement ordinary API rate limits.

---

# 46. Multi-Tenant Isolation

Even though the hackathon MVP may have a small user base, design the data model as multi-tenant.

Every user-owned object should ultimately be traceable to:

```text id="x4m8q1"
user / organization
```

For example:

```text id="r7n3p5"
Task
 └── ownerId
```

Queries should always include ownership constraints.

Bad:

```sql id="7i3tqk"
SELECT * FROM tasks WHERE id = ?
```

Better:

```sql id="q6m2v8"
SELECT *
FROM tasks
WHERE id = ?
AND user_id = ?
```

---

# 47. Provider Multi-Tenancy

Provider-side resources should similarly be scoped.

```text id="p8x4m1"
execution.provider_id = authenticatedProvider.id
```

This should be enforced in service/repository logic, not merely in the UI.

---

# 48. Admin Is Not God Mode

Avoid creating a hidden:

```text id="n4c8y2"
ADMIN_CAN_DO_ANYTHING
```

This is dangerous around payments.

Even administrators should use explicit operations:

```text id="f7m3q9"
resolveCase
approveRefund
approveAmendment
```

and those operations should produce audit records.

---

# 49. UI Architecture

The security model should be reflected in the web application.

Top-level application areas:

```text id="z6q2n8"
Buyer
├── Dashboard
├── New Task
├── My Tasks
├── Payments
└── Settings

Provider
├── Available Work
├── My Work
├── Earnings
└── Profile

Reviewer
├── Review Queue
├── Cases
└── Resolution History
```

Users should not see navigation items for areas they cannot access.

But hiding navigation is only UX.

The backend remains the actual security boundary.

---

# 50. Task Page Authorization UX

If a user attempts to open a resource they don't own, do not reveal whether it exists.

For example:

```text id="r3m7x9"
GET /tasks/task_123
```

may return:

```text
404 Not Found
```

rather than:

```text
403 You don't own task_123.
```

This avoids leaking resource existence.

---

# 51. Provider Task Access UX

Provider portal:

```text id="c5x8m2"
My Work
──────────────
Clean customer dataset
$135
Due tomorrow
Verification required
```

A provider should only see work explicitly assigned to them.

The backend enforces:

```text
execution.providerId == currentProviderId
```

---

# 52. Security Around AI Context

The identity layer also controls what the AI can see.

The context builder must never simply execute:

```text id="y4k9n1"
SELECT * FROM database
```

and give everything to the model.

Instead:

```text id="b7m2q8"
Agent Context
   ↓
Authorized task
   ↓
Authorized contract
   ↓
Authorized provider information
   ↓
Authorized payment state
```

The agent receives only data it is authorized to process.

---

# 53. Important Security Boundary

The system should have this hierarchy:

```text id="j9x5q3"
USER IDENTITY
      ↓
RESOURCE AUTHORIZATION
      ↓
TASK AUTHORITY
      ↓
DOMAIN POLICY
      ↓
EXTERNAL ACTION
```

For money:

```text id="v6m8r2"
User
 ↓
Authenticated
 ↓
Authorized
 ↓
Agent authority valid
 ↓
Contract valid
 ↓
Agreement valid
 ↓
Verification valid
 ↓
Payment policy ALLOW
 ↓
PayPal
```

Every layer narrows what can happen.

---

# 54. Threat Model

The architecture should explicitly defend against:

### Account takeover

Attacker obtains user session.

Mitigation:

- secure session handling
- session expiration
- authentication provider
- suspicious activity controls

### Horizontal privilege escalation

User attempts to access another user's task.

Mitigation:

- object-level authorization

### Provider impersonation

Attacker submits work as another provider.

Mitigation:

- authenticated provider identity
- execution ownership validation

### Agent privilege escalation

Prompt attempts to convince AI to exceed authority.

Mitigation:

- deterministic authority policy
- agent-scoped permissions
- no direct financial tools

### Prompt injection

Malicious task/provider content instructs AI to ignore policy.

Mitigation:

- untrusted content classification
- deterministic policy enforcement
- tool permission boundaries

### Payment abuse

Attacker attempts to capture funds.

Mitigation:

- payment policy
- contract hash
- verification
- idempotency
- authorization
- PayPal reconciliation

---

# 55. Security Events and Audit

Security-sensitive actions should create events such as:

```text id="x7m3q8"
AUTHORIZATION_DENIED
AGENT_AUTHORITY_DENIED
UNAUTHORIZED_RESOURCE_ACCESS
SUSPICIOUS_PAYMENT_ACTION
ACCOUNT_SUSPENDED
AGENT_REVOKED
```

This gives the system an operational security history.

---

# 56. MVP Implementation

For the hackathon, keep this simple.

Use:

```text id="p9c4x6"
Authentication Provider
        ↓
Session
        ↓
Authorization Middleware
        ↓
Service-Level Resource Checks
        ↓
Domain Policies
```

Database:

```text id="q7m2v9"
users
sessions
roles
agent_identities
authority_policies
approvals
authorization_audits
```

Do not build a custom enterprise IAM system.

The architecture matters more than complexity.

---

# 57. Example Request

Suppose the buyer approves a contract.

Request:

```text id="k8x3m1"
POST /api/tasks/task_123/contracts/contract_456/approve
```

Processing:

```text id="r5n7q2"
1. Authenticate session
        ↓
2. Identify buyer_123
        ↓
3. Load task_123
        ↓
4. Verify task.owner = buyer_123
        ↓
5. Load contract_456
        ↓
6. Verify contract belongs to task_123
        ↓
7. Verify contract status
        ↓
8. Verify current version
        ↓
9. Record approval
        ↓
10. Activate contract
        ↓
11. Emit CONTRACT_APPROVED
```

Every step is deterministic.

---

# 58. Example Agent Request

The agent wants to select Provider C.

```text id="w3p9k5"
Agent
 ↓
SELECT_PROVIDER(providerC)
```

Backend checks:

```text id="v8m4x2"
1. Agent identity valid
2. Agent belongs to task
3. Agent authority permits provider selection
4. Contract active
5. Provider eligible
6. Provider available
7. Provider satisfies contract
```

Only then:

```text id="q6n2r7"
Provider selected
```

---

# 59. Example Unauthorized Attempt

Suppose the AI tries:

```text id="y4c8m1"
CHANGE_BUDGET
$150 → $300
```

The system returns:

```text id="k7x3p9"
DENIED

Reason:
Agent authority prohibits budget modification.

Required action:
Human approval + contract amendment.
```

The agent cannot bypass this by changing its prompt.

---

# 60. Final Security Guarantee

The purpose of this component is not simply to “add login.”

It establishes a much deeper guarantee:

> **No actor — human, AI, provider, browser, or external service — receives more authority than the system explicitly grants and validates.**

The resulting architecture is:

```text id="q3m8v7"
IDENTITY
   ↓
AUTHORIZATION
   ↓
RESOURCE OWNERSHIP
   ↓
TASK AUTHORITY
   ↓
DOMAIN POLICY
   ↓
EXECUTION
   ↓
AUDIT EVENT
```

For WorkPay, that is especially important because the system is not merely moving data.

It is allowing software to cause:

**work → obligation → verification → money movement.**

The security boundary therefore has to follow the economic boundary.

**Component 13 boundary:**

> **Components 1–12 determine what the system does and how state moves through it. Component 13 determines who is allowed to initiate, observe, modify, approve, or influence those operations — including the AI agent itself.**