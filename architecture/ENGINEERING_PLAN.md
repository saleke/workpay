# WorkPay — Engineering Plan & Constraints
### Execution contract for a 2-engineer team (+ coding agents, 25 days) · PayPal Hackathon

> **This file is the single source of truth for *how* we build.**
> It fixes scope, ownership, interfaces, invariants, milestones, and definition of done.
> Neither engineer may unilaterally change anything in this file; changes require both engineers to agree in a PR that edits this document.

---

## 0. Document Authority (order of precedence)

When documents disagree, this order decides:

| # | Document | Role |
|---|----------|------|
| 1 | **This file** (`ENGINEERING_PLAN.md`) | Execution: scope, ownership, schedule, gates |
| 2 | `architecture/components/componet-19.md` | Primary implementation reference (data model, invariants, API/event/payment rules, slice order) |
| 3 | `architecture/components/componet-*.md` (1–18) | Supporting detail for the module you own |
| 4 | `architecture/overview.md` + `architecture/improvement/plan-0*.md` + `plan_advanced.md` | Product/UX guidance and MVP cut lines |
| 5 | Everything else | Non-authoritative |

**Rules of engagement with the docs:**
- The architecture documentation phase is **complete** (Component 19 §41). **Write no new architecture documents.** Working notes go in PR descriptions, not new `.md` specs.
- If a doc is wrong, ambiguous, or conflicts: log it in `OPEN-DECISIONS.md` (one line: date, doc ref, question, decision, who). Both engineers resolve within 24h. Unresolved decisions default to **the safest option** (fail closed).

---

## 1. Product Direction and Delivery Sequence

WorkPay is a general-purpose, user-led system for making work intentions, core requirements, and budget explicit; presenting professionals for user choice; and supporting consensual collaboration. Each major behavior remains open to improvement based on real-world validation.

The current completion scope is the **integrated user-led work lifecycle**:

> Interpret and confirm the user's task and budget; approve an exact brief and terms; show candidate professionals without autonomous selection; contact only the professional the buyer explicitly approves; require mutual agreement before commercial commitments; support collaboration without WorkPay silently making decisions for the parties; and make any independent review optional, agreed by both parties and the reviewer, version-bound, evidence-based, and outside WorkPay's staffing or arbitration.

Intake, discovery, communication, independent review, and payment controls are all in scope for completion and validation. Their prior designation as separate phases described sequencing, not permanent exclusions. AI can assist with understanding and organization but cannot invent binding requirements, independently contact people, adjudicate quality, or authorize acceptance or payment. An independent reviewer supplies an attributable opinion against agreed criteria; WorkPay is not the reviewer, does not certify reviewer claims, and does not provide a dispute-resolution service.

---

## 2. Scope: Phased Cut Lines

### 2.1 Current phase: complete and validate the user-led lifecycle

- Accept open-ended requests across occupations and task types without requiring a predefined domain selection.
- Preserve the original user wording and relevant supplied context as source material.
- Use validated AI-assisted stages for intent interpretation, user correction/confirmation, primary-scope clarification, and final brief composition. Keep each stage bounded and separately testable.
- Compose the professional-facing brief only after intake readiness, from user-authored source material. Keep the intake Q&A private, show budget separately, preserve exact-source evidence, and let the user edit and approve the final brief. Approval records the brief only; it does not start discovery or contact a professional.
- Track provenance for user-stated, user-confirmed, deterministically derived, and AI-proposed information. AI suggestions cannot become binding requirements without user approval.
- Capture budget meaning explicitly, including ceiling, target/range, unclear/conflicting, and an intentionally undecided state. An undecided budget carries no estimated price or funding assumption.
- Persist owner-bound intake state and immutable versions on the server. Finalization must use the exact approved server-side version and be idempotent.
- Convert an exact approved intake version into one owner-bound task and draft contract; preserve the intake link and source requirements, and make retries return the same task.
- Require the buyer to approve the generated scope and budget before discovery. Approval is not a PayPal authorization.
- Show available professional profiles as unranked, self-described information. Do not select, endorse, contact, or claim a verified fit for anyone automatically.
- Preview the chosen recipient, exact terms, and exact first message; record explicit per-recipient buyer consent before sending. Keep messaging closed until the professional accepts.
- Evaluate intake across varied work domains, writing styles, and user contexts. Include human review of model quality and correction UX.
- Support an optional reviewer-discovery directory with user-managed profiles, domain-specific expertise, clearly labeled self-supplied evidence, eligibility filters, explainable recommendations, and explicit limits on claims. Exclude the task owner and performing professional from recommendations.
- Let buyer and professional exchange private task messages after the professional accepts contact. Preserve party control over requirements, commercial decisions, and changes; do not silently apply proposed terms.
- Where independent review is chosen, require mutual agreement on reviewer, review scope, criteria, contract version, and any fee arrangement before work starts. Give the reviewer the exact agreed criteria and necessary submitted materials, with access limited to that engagement.
- Treat reviewer reports as attributable evidence and the agreed process as an explicit contract term. Never let AI decide professional quality or override objective failures. Keep payment authorization, capture, release, revision, and disputes on explicit, independently enforced policy gates; a reviewer recommendation alone is not a payment command.
- Make review-fee limitations clear: unless a separately approved payment feature is implemented, compensation is arranged directly by the parties and reviewer, not collected or guaranteed by WorkPay.
- Validate the integrated flow with separate buyer, professional, and reviewer identities against a migrated development/test database, including browser-level workflows and payment-gate outcomes.
- Preserve deterministic authorization, money, privacy, audit, and persistence controls. No database transaction may span an AI network call.

### 2.2 Follow-on design decisions within the current completion scope

- Any production payment of reviewer fees requires a separate explicit product and payment-policy decision; recording fee terms does not pay or secure the reviewer.
- Disagreement, appeal, reviewer replacement, and task disputes must be clearly distinguished from WorkPay arbitration. Until an agreed self-sustaining process exists, fail closed for payment and communicate the limitation rather than presenting an AI or WorkPay decision as final.
- Expanded profile verification must be designed as evidence disclosure and user choice; self-reported profiles are not certified credentials.

### 2.3 Out of scope for the current phase

```
✗ using model estimates as user budget, contract terms, or payment amounts
✗ treating AI-proposed requirements or browser-provided state as authoritative
✗ new infrastructure, microservices, or architecture documents without review
```

Current payment-policy validation remains USD-only. Intake must preserve the user's stated currency and must not silently convert it. Any unsupported currency or unresolved downstream commercial requirement must be made explicit before a task can enter payment-policy validation.

Live money movement is disabled for the current completion scope. The fake gateway validates amounts, authorization/capture states, idempotency, evidence gates, and failure recovery without external side effects. The UI and documentation must label those states as simulated. PayPal OAuth identity data is not charging authority, payout authority, or independent identity verification. A production gateway requires a separately approved marketplace-payment model, explicit provider onboarding, explicit buyer approval at the provider, webhook/reconciliation validation, and an engineering and legal review before `PAYMENT_GATEWAY=paypal` can be enabled.

The existing technical stack and safety invariants remain authoritative. This user-approved direction supersedes the earlier intake-only phase boundary and deferrals in this execution plan. The integrated lifecycle must be judged by the current scope above, not by those obsolete exclusions.

---

## 3. Non-Negotiable Invariants

These are **testable laws** (derived from Component 19 §13/§34 and Components 6, 9, 13, 14). A PR that violates any of them is rejected regardless of how good the feature is. The full automated suite lives in `invariants.test.ts` (Appendix D).

**Enforcement preference (highest available wins):** DB constraint > domain test > code convention. Where Postgres can enforce an invariant (CHECK on money, partial unique index on capture), it does.

### Money
- **M1.** Money is `amount_minor` (integer) + `currency`. Floating point is forbidden anywhere — DB, API, UI math, PayPal payloads.
- **M2.** `amount_minor >= 0`. Amounts come **only** from the contract/agreement — never from the LLM, never from the browser.

### Payment
- **P1.** Capture allowed **iff all** hold: payment authorized ∧ agreement valid ∧ contract version+hash match ∧ verification = `PASS` ∧ no blocking case ∧ amount/currency match ∧ authorization still valid ∧ policy `ALLOW`. Otherwise: **DO NOT CAPTURE**.
- **P2.** `verification != PASS → automatic capture forbidden`. `UNCERTAIN` never releases money. No-decision = no-capture (fail closed, never "error → allow").
- **P3.** The AI **recommends**; deterministic policy **decides**. No code path may take an LLM output as a capture/authorize/refund instruction.
- **P4.** Every money-moving command is idempotent (idempotency key + `payment_operations` append-only). Duplicate capture is impossible. Unknown PayPal state → **reconcile**, never guess.
- **P5.** Authorization ≠ capture in data **and** in UI copy ("authorized" vs "paid").

### Authority
- **A1.** `agent authority <= user-granted authority`. No layer may broaden a higher layer's grant (browser < API < domain < policy < PayPal reality).
- **A2.** Authenticated ≠ authorized. IDs are not authorization. Object-level checks on every resource. The UI is not a security boundary.
- **A3.** Contract approval binds to exact `contract_version` + SHA-256 hash. Active contract immutable; material change → new version + re-approval.

### Data & events
- **D1.** State change + outbox event commit in the **same transaction**. Consumers are idempotent (`processed_events`).
- **D2.** Economically significant records are immutable/append-only; history is never rewritten or deleted.
- **D3.** No DB transaction is ever held across an LLM, PayPal, or storage network call. Short transactions only.
- **D4.** Postgres is the sole authoritative store. Files live in object storage; DB metadata + SHA-256 checksum = artifact identity. Browser and LLM context are never authoritative.
- **D5.** No module writes another module's tables directly (see §6.3 and Appendix B).
- **D6.** Conversation messages do not amend an agreement. A structured change proposal snapshots the complete replacement terms against the exact approved contract version/hash; the other participant must accept it. Acceptance remains pending activation until WorkPay creates the next immutable contract version and completes the required external payment action. Until then, the current contract remains authoritative and capture is blocked. Unknown PayPal state requires reconciliation; lower post-capture totals require an explicit refund review, never an automatic refund. An accepted but not-yet-active proposal can only be cancelled with both participants' consent.

### AI
- **I1.** AI outputs are untrusted data: schema-validated, provenance-tagged, never executed as instructions. `AI_PROPOSED` requirements cannot enter an active contract without user confirmation.
- **I2.** No LLM in the payment path. No secrets/credentials in prompts or agent context. Planner/agent tools never include `capture`, `refund`, `change_budget`, `override_verification`.

### Frontend
- **F1.** Server state is authoritative; client state is disposable. Every consequential operation goes through `/api/v1`. No business logic, payment math, or permission decisions in the frontend.

---

## 4. Current Technical Baseline and Change Criteria

This is the current technical baseline, not a claim that every choice is optimal. Keep an existing choice when it remains fit for purpose; change it when an evidence-based improvement justifies the migration, reliability, security, and operational costs. Shared contracts and high-impact infrastructure changes still require engineering review.

| Layer | Decision | Note / amendment |
|-------|----------|------------------|
| Frontend | **Next.js (App Router) + React + TypeScript** | Desktop-first, responsive |
| UI | **Tailwind CSS + shadcn/ui** | Nothing beyond shadcn — no heavy component suite (§2.2) |
| App shape | ⚠ **One Next.js app for web + `/api/v1` route handlers, plus a separate worker process from the same codebase** | "Inside the same Next.js app" is right for HTTP, wrong for jobs: pg-boss consumers, outbox publisher, verification runs, reconciliation, and the agent loop need a **long-lived process**. Layout: `apps/web` (UI + thin route handlers) · `apps/worker` (all background work) · `packages/shared`. Domain modules (`src/modules/*`) are imported by both — no logic in route handlers (§6.3.1). **Express is dropped** — one app is faster for a 2-person team |
| API | **REST + Zod** | ⚠ Zod schemas are the **single contract source**: generate `docs/openapi.yaml` (zod-to-openapi) **and** frontend client types from them. Hand-maintained specs drift — this is our #1 A/B interface risk (§6.1) |
| Database | **PostgreSQL — managed: Supabase (default) · local: Docker** | ⚠ Supabase over Neon for this event: Neon's plan autosuspends after a few minutes idle (cold start on the first request, and a polling worker burns your monthly compute hours), while **Supabase free pauses only after ~7 days of inactivity** — it never sleeps during the hackathon. Use the **pooled connection (Supavisor) for Vercel/serverless** and a **direct connection for the worker + migrations**. Accept whatever PG major Supabase offers (17 or 18) — nothing in this plan needs PG18-specific features. ⚠ Push invariants into the DB where possible: `CHECK (amount_minor >= 0)`, `timestamptz` everywhere, and a partial unique index making **at-most-one capture row per payment** (DB-enforced P4) |
| ORM/query layer | **Drizzle ORM** (+ drizzle-kit) | Generated SQL is committed as **append-only numbered migrations**; CI runs migrations from scratch; no hand-edits to applied migrations |
| Background jobs | **pg-boss** (dedicated `pgboss` schema) | Queues per domain: `outbox, verification, reconciliation, agent, notifications`. Financial jobs: bounded retries + **error classification** (invalid/permission errors never auto-retry — P4) + dead-letter inspected daily |
| Eventing | **PostgreSQL outbox + pg-boss** | ⚠ The outbox stays ours (`outbox_events`, `processed_events` — invariant D1). pg-boss is only the transport that says "go process this event"; it never replaces the event store |
| AI | **Vercel AI SDK with AI Gateway** | Keep a small internal adapter and use separate schema-validated operations for intent interpretation, clarification, and brief composition. Configure and record the selected model and prompt versions. Bound timeouts/retries. A model failure leaves a recoverable draft; no deterministic fallback may fabricate readiness or user approval. User text and attachments are untrusted data, not instructions. |
| AI validation | **Zod** | Shared schemas live in `packages/shared` — planner, verifier, and agent all validate through the same schemas |
| Payments | **PayPal Orders v2 (authorize → capture) + Webhooks v2** | Behind internal `PaymentGateway`. `PayPal-Request-Id` header = second idempotency layer over §6.3.6. Webhook signature verification mandatory. **Two implementations: `FakePayPal`** (unit/e2e/CI/rehearsals — deterministic, no network) **+ `SandboxPayPal`** (demo). CI never depends on PayPal uptime |
| Files | **S3-compatible object storage** | MinIO locally; **Supabase Storage** hosted (S3-compatible endpoint, real presigned PUT/GET) so DB + files are one vendor. Cloudflare R2 is a fine swap. One `ObjectStorage` adapter (A). Bucket/keys are config, never code |
| Realtime | **SSE** | ⚠ Serverless platforms cut long-lived streams: the events endpoint must ship with a **cursor fallback from day one** — `GET .../events?since=` + `Last-Event-ID` reconnect + client refetch-on-reconnect. Realtime never replaces authoritative API state |
| Auth | **Auth.js** (v5, credentials) — *original recommendation; verify against the existing app* | Roles and per-request authorization must be grounded in the existing auth model. Any provider or role migration is a separate decision, not an intake prerequisite. |
| Deployment | **Fit the workload to the host — not one platform for everything.** Web + API + SSE + PayPal webhook → **Vercel** · background worker → a **long-lived-process host** · data → **Supabase** | This is the original deployment proposal, not a verified statement of the current repository or deployment. Inspect the actual runtime and hosting constraints before any migration or deployment work; the current intake milestones do not require a platform rebuild. |
| Testing | **Vitest + Playwright** | Deterministic state/provenance/budget invariants, model regression evaluations, human-reviewed UX cases, and end-to-end tests for the current intake phase. External payment tests are outside the intake gate. |
| Observability | **Sentry + structured JSON logs** | Correlation ID via AsyncLocalStorage on every request/job; `audit_records` for economic actions; job failures alert through Sentry |
| Package manager | **pnpm** (workspaces) | No Turborepo unless build time actually hurts |
| Language | **TypeScript strict everywhere** | `strict: true`, no `any` in module interfaces |
| Dev tooling (added) | Docker Compose (postgres + minio) · webhook tunnel (ngrok) · `make` targets (`up, migrate, seed, reset-demo, test, e2e`) | Env validated by Zod at boot: **missing critical secret = startup failure**, not a half-working app (Component 18) |

PayPal sandbox setup and webhook tunneling are not dependencies for the current intake phase. Verify the existing payment integration before any separately approved payment work.

---

## 5. Ownership Map

This map describes existing module boundaries and historical ownership. It does not expand the current intake phase in §2; candidate discovery, negotiation, execution, payment, and completion review remain deferred.

Two owners. Every module, table, endpoint, and event has exactly **one** owner. Ownership means: builds it, tests it, reviews it, fixes it.

### 5.1 Engineer A — **Platform & Money**

> Keeps the system standing and the money safe.

| Area | Components | Scope |
|------|-----------|-------|
| Repo, CI, deploy spine, migrations, jobs, outbox worker | 14, 12, 18 | Scaffold, append-only migrations, `outbox_events`/`processed_events`/`idempotency_records` + pg-boss config, worker process, Vercel + worker deployment wiring (§4), `/health` `/ready`, Zod-validated env/secrets, kill switch `SYSTEM_PAYMENT_PAUSE` |
| API shell | 15 | `/api/v1` route handlers in Next.js (thin), auth middleware, Zod validation, error model `{code,message,requestId}`, `Idempotency-Key`, cursor pagination, **SSE endpoint + `?since=` cursor fallback**, rate limiting, correlation IDs |
| Identity & authority | 13 | users/sessions/roles, authorization service, object-level checks, authority policies (incl. agent identity & revocation), authorization audit |
| Task intake | 1 | task creation, immutable `originalRequest`, `task_files`, `TASK_CREATED` |
| Tasks module (lifecycle) | 1, 11 | **Sole writer of `tasks.status`** via guarded `transition()` interface; all other modules request transitions |
| Contract compiler & approval | 3 | spec → contract, acceptance-rule persistence, hashing/versioning, approval bound to hash, `CONTRACT_APPROVED` |
| Negotiation & agreement | 5 | negotiations, offers (immutable), authority-envelope validation, `COMMERCIAL_AGREEMENT_CREATED`, scope-change → amendment |
| Payment orchestration + policy | 6, 9 | payments/decisions/policy_checks/commands, authorize & capture paths, 12 deterministic checks, webhook handler, reconciliation job, refund/void (post-MVP stubs only) |
| PayPal adapter | 17 | `PaymentGateway` ↔ Orders v2 + `PayPal-Request-Id`, webhook signature verification/dedup, error classification, reconciliation job; **`FakePayPal` (A, for CI/e2e) + `SandboxPayPal` (A, for demo)** |
| Storage adapter + file endpoints | 17, 1 | `ObjectStorage` interface + adapter, signed upload/download URLs, checksum verification |
| Events infrastructure + activity data | 12 | event envelope, catalog, outbox publisher, `events` store, `GET /tasks/{id}/activity` (projection over events) |
| Operations | 18 | structured logs, correlation IDs, metrics basics, incident kill switch, invariant test harness ownership |

### 5.2 Engineer B — **Proof, AI & Experience**

> Proves the work is real and makes the whole thing understandable.

| Area | Components | Scope |
|------|-----------|-------|
| Planner | 2 | context build, LLM structured output → Work Specification, provenance tagging, deterministic validation, clarification engine, `WORK_SPEC_CREATED` |
| AI adapter | 17 | `AIProvider` interface, model/timeout/retry/validation, prompt isolation (untrusted file content never concatenated into instructions), **`FakeAI` implementation returning canned structured outputs for tests/e2e** |
| Provider discovery & selection | 4 | seeded providers, hard eligibility filter, ranking, explainable recommendation, `PROVIDER_SELECTED`, selection snapshot/expiry |
| Execution & submission | 7 | provider portal flows, acceptance, work status, clarifications, immutable versioned submissions + checksums, revision cycle, `SUBMISSION_*`, `REVISION_REQUESTED` |
| Verification & acceptance | 8 | Existing later-stage verification module; dataset-specific checks are not a constraint on general-purpose intake |
| Cases (minimal) | 10 | 5 case types, blocking `case_impacts`, evidence bundle, single reviewer resolution API, `CASE_OPENED`/`CASE_RESOLVED` |
| Agent orchestrator | 11 | Existing bounded-action module; any future automation must be redesigned against explicit user authority and the user-led candidate/contact flow before reactivation |
| Event consumers | 12 | verification trigger, case→payment blocking, agent wake |
| Notifications (in-app) | — | bell + links, derived from events |
| **Entire frontend** | 16, overview, plan-02 | buyer app (shell, New Task, My Tasks, **Task Room**, contract review, provider recommendation, payments, activity, human-review states), provider portal, SSE rendering, empty/loading/error/a11y states |

### 5.3 Legacy Platform Bootstrap Checklist

The checklist below belongs to the original greenfield plan. This repository already contains an implemented application, so these items are not current intake milestones or an instruction to rebuild the platform. Before reusing any item, verify it against the repository and the current product direction; the intake scope and gates are defined in §§2 and 7.

Nothing else starts until this exists. Both engineers, two days, pair-session style:

1. pnpm-workspace scaffold (`apps/web`, `apps/worker`, `packages/shared`), lint/test/CI green on an empty commit, `make` targets
2. Local runtime: `docker compose` (postgres + minio) + append-only Drizzle migration runner; migrations-from-scratch verified in CI
3. **Full draft schema** for every table in Appendix B (A authors, B reviews — this is the contract), including the DB-level invariant constraints (§4)
4. **Event catalog** frozen at `packages/shared/events.ts` (Appendix A): names, payload schemas, producer, consumers
5. **Zod → OpenAPI → client-types pipeline**: endpoint schemas in code generate `docs/openapi.yaml` + the frontend API client (§4 API row)
6. Auth: Auth.js session + `authorize(actor, action, resource)` middleware + role seeds (buyer, provider, admin-reviewer) + cross-user denial test
7. **Acceptance-rule schema** (`acceptance_rules` JSON shape + verification `Check` interface) — *jointly designed because it crosses ownership: A persists it in the contract, B's verifier executes it*
8. `Money` type, ID format (UUID), UTC timestamps, error model, idempotency middleware, correlation-ID plumbing
9. Outbox writer helper + worker loop + pg-boss queues; `events` → SSE stub **with the `?since=` cursor fallback**
10. **Deploy spine** (A-led): Vercel preview deployment + Supabase project (DB + storage bucket + pooled/direct connection strings) + **worker deployed to the long-lived host** (default Railway) + webhook tunnel all reachable; one real event round-trip on deployed infra
11. `FakePayPal` + `FakeAI` adapters (interfaces only, throwing not-implemented where needed)
12. Seed script: buyer user, provider user, seeded provider profile, `customers.csv` (5,000 rows, known duplicate rate), sandbox PayPal account linked
13. `invariants.test.ts` harness with the Appendix D list stubbed and failing-red

### 5.4 Capacity rebalance clause

If a milestone load is chronically ahead/behind at a gate review, the team may reassign a **whole module** (never a partial one) with a written handoff: module state, open TODOs, and owning tests. Reflect ownership changes in §5.

---

## 6. The A ⇄ B Interface (frozen contracts)

### 6.1 What may never be changed unilaterally
- Event names/payloads (`packages/shared/events.ts`) — change requires: PR updates catalog + all producers/consumers + both approvals
- OpenAPI paths owned by the other engineer — propose in the spec PR, owner implements
- Shared contracts (domain schemas, shared types, and event payloads) — same rule
- Schema: migrations affecting another's tables require the table owner's approval

### 6.2 Communication protocol
- **Daily async written update** (3 bullets: done / doing / blocked) + **15-min sync** at a fixed time
- **Gate demo**: each milestone ends with a *live joint demo* of the gate criteria — no exceptions, no "works on my machine"
- Integration rule: **main must be green at least once per working day per engineer**; feature flags/short-lived branches only (< 2 days)
- Blocked > 2 hours → raise it at the sync. Disagreement → safest option + log in `OPEN-DECISIONS.md`

### 6.3 Module boundary rules (both, always)
1. Routes do: validate (Zod) → authorize → call domain service → map response. **No business logic in routes, no business logic in the frontend.**
2. Cross-module reads go through the owner's exported service/repository function. Read-only SQL against another owner's tables is allowed **only** for the projection reads listed in Appendix B.
3. Task status changes only via A's `tasks.transition()`; verification/payment do not poke `tasks.status`.
4. The only code that talks to PayPal is `integrations/paypal` (A). The only code that talks to an LLM is `integrations/ai` (B). The only code that talks to object storage is `integrations/storage` (A).
5. Every domain event is a **past-tense fact**. Events never grant authority; consumers re-check policy before acting (especially payment events).
6. Idempotency keys on: task creation, offer submission, authorize, capture, submit-for-verification, case resolve.

---

## 7. Milestones & Gates

The previous D1-D25 hackathon schedule and M1-M7 provider/payment/agent sequence are retired. They do not authorize implementation of the old autonomous provider lifecycle. Re-estimate the current phase; do not reuse the old dates or gates.

| Milestone | Outcome | Gate |
|-----------|---------|------|
| **M1: Intent and evaluation model** | Versioned intent/provenance contract, explicit budget states, readiness rules, and representative evaluation cases | Schema/state tests and the evaluation set prove raw request preservation and nonbinding AI proposals |
| **M2: Server-owned AI intake** | Persisted sessions; separate interpretation, primary clarification, and brief-composition operations | AI failure, stale versions, unowned sessions, and unresolved critical questions cannot produce a ready/approved brief |
| **M3: User confirmation and finalization** | Editable interpretation, minimal clarification UX, explicit budget choice, and approval of an exact brief version | API/UI tests prove browser tampering cannot change the approved version and finalization is idempotent |
| **M4: User-led professional flow** | Buyer-approved terms, candidate choice, exact-message contact approval, professional response, and mutual commercial terms | Separate-identity API/UI tests prove no automatic selection/contact and no payment before valid agreement |
| **M5: Collaboration and independent review** | Party-controlled messaging and amendments; optional external reviewer with mutual consent, exact criteria/materials, report, and explicit limits | Lifecycle tests cover stale versions, conflicts, revision cycles, privacy, reviewer disagreement, and fail-closed payment |
| **M6: Integrated quality and operations** | Migrations verified from scratch, seeded test roles, human-reviewed intake evaluation, accessibility/usability, and complete browser flow | Test evidence from a confirmed development/test database; representative browser workflows pass with no external payment side effects |

**Implementation checkpoint:** the versioned intake API exposes separate interpretation, interpretation confirmation/correction, scope assessment, single-question answers, budget decisions, communication-style preferences, and exact-version approval operations under `/api/v1/intake/sessions`. Mutations require the expected version; model calls run outside database transactions; only user-authored sources can support intent or budget evidence; and approval is rejected while readiness blockers remain. Correcting an interpretation preserves the rejected proposal only as nonbinding context for the next interpretation call. An approved intake can create a single owner-bound task and draft contract; the buyer must approve terms before viewing unranked available profiles, and contact requires a separate explicit confirmation of the selected professional and exact message. No payment is authorized by those approvals. Legacy scoping/finalization and direct task creation remain disabled. Automatic provider selection/negotiation is retired. AI Gateway remains disabled by default, and no live model quality or usability gate has been claimed.

All milestones are in the current completion scope; prior phase boundaries do not defer any of them. No schedule date is set until the team estimates these milestones against the existing repository. Each gate requires test evidence, UX review, and engineering review. AI failures must preserve a recoverable draft and must never silently mark the brief ready or approved.

The initial versioned corpus, annotation rubric, and pass thresholds live in `packages/shared/src/domain/intake/evaluation/`. They are a seed for M1 contract and regression work, not statistical evidence of broad performance. Before model selection or implementation, preserve these gates: zero invented binding requirements, lost explicit constraints, budget misclassification, inferred spend ceilings, silent currency conversion, and false-ready outcomes on curated critical-unknown cases. Human-rated question usefulness and user comprehension thresholds are also specified there; do not rely on an LLM judge alone or tune thresholds after seeing model results. Expand and stratify the set before rollout.

---

## 8. Definition of Done

### 8.1 Per feature (applies to both engineers)
A feature is done when **all** hold:
1. Domain logic lives in the module (not routes, not frontend) and is unit-tested
2. Input validated with Zod; output matches the OpenAPI spec (spec updated in the same PR)
3. Authorization checked at the service level (object-level, not just role)
4. Events emitted per catalog, in the same transaction as state; consumers idempotent
5. Idempotency where §6.3.6 requires; no floats; no DB transaction across external calls
6. Loading / empty / error / permission-denied states exist in the UI (B) or error codes exist in the API (A)
7. Owner reviewed their own code against §3 invariants before requesting merge
8. Gate-relevant behavior demoed at the next sync

### 8.2 Engineer A's personal DoD
- Every money path has: deterministic policy check → persisted decision with reasons → idempotent execution → append-only audit record → invariant test
- PayPal code reachable only through `PaymentGateway`; webhook verification + dedup tested with a forged signature (must reject)
- `make reset-demo` still works; migrations append-only and re-runnable from scratch
- Main green daily; no schema change merged without B's approval

### 8.3 Engineer B's personal DoD
- Every LLM call: schema-validated output, provenance tagged, timeout+retry. Failure preserves a recoverable draft and cannot mark intent ready or approved; deterministic fallback must not invent a complete brief.
- Verification compares against the **contract snapshot**; evidence persisted per requirement; FAIL produces a user-readable expected-vs-actual explanation
- Frontend computes zero authoritative values (amounts, permissions, verdicts) — reads API only; provider user cannot reach buyer-only routes (tested)
- Main green daily; event catalog changes proposed with payloads + both approvals

### 8.4 Current phase DoD
| User need | System must show | Gate |
|---|---|---|
| "What did you understand?" | The original request and a concise, editable interpretation with provenance | M1 |
| "What did you assume?" | Explicit facts, unknowns, and AI proposals visibly distinguished; proposals are nonbinding | M1/M2 |
| "What do you still need from me?" | Only task-critical clarifications, one focused question at a time, with a reason | M2 |
| "What is my budget?" | The user's confirmed amount/range/currency or an explicit undecided state, never an AI-imputed ceiling | M2 |
| "What am I approving?" | The exact server-owned brief version and its confirmed requirements before it is frozen | M3 |
| "Who will be contacted?" | The chosen professional, exact terms, and exact first message before explicit per-recipient consent | M4 |
| "What happens after contact?" | A professional's explicit response and mutual agreement before a commercial commitment | M4 |
| "Who reviews the work?" | Optional reviewer identity, conflicts, fee/payer, exact criteria, and contract version accepted by both parties and reviewer | M5 |
| "What is the reviewer judging?" | The exact accepted contract criteria and permitted submission materials, with access limited to that engagement | M5 |
| "What happens if review is inconclusive or disputed?" | A clear fail-closed status and no WorkPay/AI claim of arbitration or automatic payment authority | M5 |

No earlier gate implies consent or authorizes a later action. Each transition remains explicit, independently enforced, auditable, and reversible only through a defined state transition.

---

## 9. Rules of Engagement (humans + coding agents)

### 9.1 Humans

**Never (either engineer, any deadline):**
- move money without the full P1 condition set · trust a number from the browser or an LLM · write floats for money · skip idempotency on money paths · hold a DB transaction across a network call · put secrets in the frontend/prompts · bypass `authorize()` · edit another owner's module without pairing · add architecture docs · add infrastructure technology (§2.2) · ship a gate "temporarily" failing

**Always:**
- smallest diff that satisfies the gate · update spec+catalog in the same PR · keep main green daily · log doc conflicts in `OPEN-DECISIONS.md` · prefer fail-closed · demo at the sync · **review agent-authored PRs the same day** (review latency, not coding speed, is the real throughput limit)

### 9.2 Coding-agent protocol

Coding agents give us parallel implementation speed. They do **not** own judgment. These rules bind every agent session:

1. **One agent at a time per module.** An agent works *inside* one owned module on a short-lived branch (< 2 days). Never run two agents on the same module or on shared-kernel files simultaneously.
2. **Context pack, every session.** Feed the agent exactly: (a) the §3 invariants relevant to the task, (b) the owned component doc path, (c) `packages/shared` schemas/types it must use, (d) the gate criteria it serves. An agent without the context pack produces code we have to rewrite.
3. **Shared contracts are human work.** Event catalog, OpenAPI endpoint definitions, DB schema/migrations for shared tables, acceptance-rule schema, and this plan — drafted or approved by the owning human, never by an agent unattended. Agent PRs touching these get a human redesign review, not a rubber stamp.
4. **Agent PRs follow §8.1 + invariants.** The owning engineer reviews against the per-feature DoD and runs `invariants.test.ts`; the agent never merges its own PR. "It works locally" is not a review.
5. **Dependency budget.** No new runtime dependency, service, or SaaS without an owner's note in the PR description. Agents love to add packages; we don't.
6. **Tests ride with code.** Agent-generated logic ships with agent-generated tests *and* a human-written edge case the agent didn't think of (P4 money paths, authz, malformed LLM output).
7. **Division of labor:** use agents for scaffolding modules from Zod schemas + interfaces, UI screens from shadcn, migrations from the schema spec, test matrices from acceptance rules, fixtures, and refactors under a green suite. Do **not** delegate: payment-policy design, event schema, cross-module refactors, security/authorization decisions, the demo script.
8. **Humans stay in the loop at gates.** The live gate demo is by the humans (agents don't demo); anything an agent built must be explainable by its owner in the demo Q&A (§8.4).

---

## 10. Current Phase Cut-Lines

The old D1-D25 buffer and cut-line schedule is retired. If delivery capacity is constrained, agree a revised schedule before reducing scope.

**Never cut from the integrated lifecycle:**
- Preservation of the original request and server-owned session state.
- Provenance and user confirmation for every binding requirement.
- Explicit budget meaning, including the user-approved undecided state; no inferred ceiling or silent currency conversion.
- Fail-closed behavior for invalid model output, stale versions, ownership failures, and persistence errors.
- Regression evaluation of critical constraints, false-ready cases, budget handling, consent, version binding, access control, and payment gates.
- User choice and explicit consent before professional contact; mutual agreement before commercial commitment.
- Reviewer independence, exact agreed review context, limited artifact access, and fail-closed handling of uncertain or disputed outcomes.

Optional presentation polish may be deferred, but users must always be able to understand, correct, and explicitly confirm the brief and each consequential transition. No integrated lifecycle capability is excluded merely because it was formerly scheduled later.

---

## 11. Risk Register

| # | Risk | Owner | Mitigation | Trigger |
|---|------|-------|-----------|---------|
| R1 | Model overgeneralizes or privileges familiar task domains | Intake | Evaluate across varied occupations, languages, expression styles, and task types; require human review of representative outputs | Before rollout |
| R2 | LLM structured output unreliable, preventing safe progression | Intake | Bounded retry, preserve a recoverable draft, explain failure, allow user correction; invalid output never marks a brief ready | Before rollout |
| R3 | Intake over-asks secondary details or misses critical unknowns | Product/UX | Test question usefulness and unnecessary-question rate with representative users; limit clarification to material task-critical information | Before rollout |
| R4 | Ambiguous budget is silently converted into a price or ceiling | Intake | Model budget meaning explicitly; permit undecided; require user confirmation; never infer a spend limit or convert currencies silently | Before rollout |
| R5 | Client tampering, stale versions, or cross-user access corrupts approved intent | API | Server-owned, owner-bound version state; authorization on every request; version checks and idempotent finalization; targeted security tests | Before rollout |
| R6 | Legacy provider-search route triggers unapproved downstream actions | API | Keep it out of intake; disable or remove its side effects before redesigned product release; test that intake cannot reach it | Before rollout |
| R7 | Deployment or runtime assumptions do not match the existing app | Engineering | Inspect current hosting and runtime before selecting dependencies or changing deployment; validate operational limits before rollout | Before rollout |
| R8 | AI integration adds unreviewed data exposure or instruction-following risk | Engineering | Treat user text and attachments as untrusted input; minimize model context, record model/prompt versions, and test prompt-injection and privacy boundaries | Before rollout |
| R9 | Reviewer report is mistaken for WorkPay certification or impartial arbitration | Product/UX | Label claims as self-reported, disclose reviewer identity and conflicts, bind report to agreed criteria/version, and keep appeals/disputes outside WorkPay unless separately designed | Before review rollout |
| R10 | A report or UI state bypasses payment policy or causes duplicate settlement | Payments | Recheck agreement, contract, payment, verification, blocking cases, authorization, idempotency, and gateway state at the money-moving boundary; test PASS/FAIL/UNCERTAIN and retries | Before any live money flow |

---

## Appendix A — Existing Event Catalog and Change Gate

The catalog below is a compatibility reference for the existing system. During the intake phase, no event may automatically trigger provider search, professional contact, negotiation, offer acceptance, or payment. The user-led candidate flow and its events require a separate design before implementation.

Producer owns the payload; consumers listed are the only ones that must react. Full envelope (id, correlation, causation, actor, version) per Component 12.

| Event | Producer (owner) | Consumers |
|-------|------------------|-----------|
| `TASK_CREATED` | A | B (planner), A (activity) |
| `WORK_SPEC_CREATED` / `CLARIFICATION_*` | B | A (contract compile), B (UI) |
| `CONTRACT_APPROVED` | A | B (activity only; no automatic provider search) |
| `PROVIDER_SEARCH_STARTED` / `PROVIDER_CANDIDATES_DISCOVERED` / `PROVIDER_SELECTION_FAILED` | Buyer-controlled discovery | Activity only; discovery never selects a professional |
| `NEGOTIATION_STARTED` / `OFFER_*` / `COUNTEROFFER_RECEIVED` / `SCOPE_CHANGE_REQUESTED` | A | B (UI/activity), agent |
| `COMMERCIAL_AGREEMENT_CREATED` | A | A (payment), B (execution), activity |
| `PAYMENT_AUTHORIZED` / `PAYMENT_AUTHORIZATION_FAILED` | A | B (UI/activity), agent, execution |
| `PROVIDER_ACCEPTED` / `WORK_STARTED` / `SUBMISSION_CREATED` / `SUBMISSION_SUBMITTED` / `SUBMISSION_RESUBMITTED` / `REVISION_REQUESTED` | B | B (verification), activity |
| `VERIFICATION_STARTED` / `VERIFICATION_PASSED` / `VERIFICATION_FAILED` / `VERIFICATION_UNCERTAIN` | B | A (payment policy), activity, agent |
| `CASE_OPENED` / `CASE_RESOLVED` (with blocking flag) | B | A (payment policy), activity |
| `CAPTURE_COMMAND_CREATED` / `PAYMENT_CAPTURED` / `PAYMENT_CAPTURE_FAILED` | A | B (UI), activity, agent |
| `TASK_STATUS_CHANGED` | A | B (UI/activity), agent |
| `AGENT_ACTION_*` / `AGENT_AUTHORITY_DENIED` | B (action) / A (denial) | activity, audit |

## Appendix B — Table Ownership (from Component 19 §6)

**A owns:** `users, sessions, roles` · `tasks, task_files` · `work_contracts, contract_requirements, scope_items, acceptance_rules, approvals` · `negotiations, offers, commercial_agreements` · `payments, payment_decisions, payment_policy_checks, payment_commands` · `events, outbox_events, processed_events, jobs, idempotency_records, audit_records` · file metadata

**B owns:** `work_specifications, requirements, clarifications` · `providers, capabilities, availability, reputation, provider_selections` · `work_executions, provider_acceptances, work_submissions, submission_artifacts` · `verification_runs, verification_results, acceptance_decisions` · `cases, case_messages, case_evidence, resolutions, case_impacts` · `agent_runs, agent_actions`

**Cross-owner reads permitted (read-only, no joins into writes):**
- A's payment policy reads: `verification_results`, `acceptance_decisions`, `case_impacts`, `commercial_agreements`, `work_contracts` — via B's exported read functions
- B's UI/agents read: `payments`, `payment_decisions`, contract/agreement snapshots — via A's API only (no direct SQL)
- Both may read `events` for projections

**All writes to another owner's tables: forbidden.** Task status: only via A's `tasks.transition()`.

## Appendix C — Existing Endpoint Ownership

This is a map of existing endpoints, not a license to expose all of them in the current product phase. In particular, the legacy `POST /api/v1/tasks/{id}/provider-search` path can start negotiation, accept an offer, and authorize payment; it must not be invoked or exposed as part of intake and must be disabled or stripped of those side effects before the redesigned product is released.

**A:** `POST/GET /api/v1/tasks` · `POST /api/v1/tasks/{id}/files` (signed URL) · `GET /api/v1/tasks/{id}/activity` · `GET /api/v1/tasks/{id}/events` (SSE) · `GET /api/v1/contracts/{id}` · `POST /api/v1/contracts/{id}/approve` · `POST /api/v1/negotiations` · `POST /api/v1/negotiations/{id}/offers` · `POST /api/v1/negotiations/{id}/respond` · `GET /api/v1/tasks/{id}/payment` · `POST /api/v1/payments/{id}/authorize` · `POST /api/v1/payments/{id}/capture` (internal, policy-gated) · `POST /api/v1/webhooks/paypal` · `GET /api/v1/payments` · `GET /health` · `GET /ready` · auth/session endpoints

**B:** `POST /api/v1/tasks/{id}/plan` (internal) · `GET/POST /api/v1/tasks/{id}/clarifications` · `GET /api/v1/tasks/{id}/provider-selection` · `POST /api/v1/tasks/{id}/provider-search` (legacy, disable before rollout) · `GET /api/v1/provider/work` · `POST /api/v1/provider/work/{id}/accept` · `POST /api/v1/provider/work/{id}/start` · `POST /api/v1/submissions` · `GET /api/v1/submissions/{id}/verification` · `POST /api/v1/verifications/{id}/review` · `GET/POST /api/v1/cases` · `POST /api/v1/cases/{id}/resolve` · `GET /api/v1/notifications` · legacy agent endpoints

The frontend consumes **only** `/api/v1` + SSE. Generated types from `docs/openapi.yaml` — no hand-written client types. Route handlers live in `apps/web/app/api/v1/**`; ownership follows the path prefix above (A owns the `/tasks`, `/contracts`, `/negotiations`, `/payments`, `/webhooks` segments; B owns `/provider`, `/submissions`, `/verifications`, `/cases`, `/notifications` and the agent endpoints).

## Appendix D — Existing-System Invariant Catalog

The original target milestones in this catalog are retired along with the D1-D25/M1-M7 schedule. These safeguards remain relevant to the existing payment, authorization, and execution modules, but do not define intake delivery order.

| Test | §Ref | Owner | Historical target |
|------|------|-------|--------|
| Money stored/compared only as minor units; float path fails typecheck + test; DB CHECK rejects negative amounts | M1 | A | Gate 0 |
| Client-supplied amount ≠ agreement amount → authorize DENIED | M2, P3 | A | M3 |
| Capture with `FAIL` verdict → DENIED (persisted reason) | P1, P2 | A | M5 |
| Capture with `UNCERTAIN` verdict → DENIED; open blocking case → DENIED | P1, P2 | A | M5 |
| Capture with contract hash/version mismatch → DENIED | A3 | A | M6 |
| Capture without `ALLOW` decision → impossible (no command constructible) | P1 | A | M6 |
| Two capture commands same payment → exactly one PayPal call (+ DB partial-unique index = at-most-one capture row) | P4 | A | M6 |
| Forged PayPal webhook signature → rejected; replay → no-op | P4 | A | M3 |
| Crash between capture request and webhook → reconciliation resolves, no dup | P4 | A | M6 |
| Approval against stale contract version → rejected | A3 | A | M1 |
| Cross-user task/file access → 403 (IDs ≠ authorization) | A2 | A+B | M1/M4 |
| Over-budget offer → deterministic refusal; agent authority > user → denied + audited | A1 | A+B | M2/M7 |
| Agent tool list contains no capture/refund/change_budget/override | P3, I2 | B | M7 |
| Requirement added after approval cannot fail a provider | I1, D2 | B | M5 |
| Verification run against wrong contract snapshot → hard failure, no verdict | P1 | B | M5 |
| LLM malformed output → retry → draft remains non-ready and recoverable | I1 | B | M2 |
| Outbox: state + event atomic; duplicate delivery → consumer no-op | D1 | A | Gate 0 |
| Submission re-upload creates new version; v1 bytes unchanged (checksum) | D2 | B | M4 |
| `SYSTEM_PAYMENT_PAUSE=true` → capture blocked | P3 | A | M6 |

---

*This draft is the current product and delivery baseline, not a claim that every architecture decision is settled. Validate assumptions against the existing repository, keep evaluation design ahead of implementation, and revise the plan when evidence shows a better direction.*
