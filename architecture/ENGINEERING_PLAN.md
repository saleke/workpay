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

## 1. The Mission: One Excellent Proof

The MVP is **one complete vertical** (Component 19 §35) — nothing else:

> **A buyer asks WorkPay to clean a dataset. The AI plans it, a human approves a bounded contract, a seeded provider is selected, a price is negotiated inside budget, PayPal authorizes the money, work is submitted, verification FAILS the first submission (money stays protected), a revision passes, payment policy allows capture, PayPal captures, task completes.**

The demo script (must run end-to-end live, in this order):

1. Buyer describes task (`Clean 5,000 customer records`) + uploads `customers.csv`
2. AI planner produces a Work Specification (provenance-tagged requirements)
3. Contract compiled → buyer reviews human-readable contract (scope, budget, acceptance criteria, **"The agent can / cannot"** panel) → **Approve & Let AI Hire**
4. Seeded provider recommended **with reasons** (why selected, alternatives collapsed)
5. Negotiation: offer within budget → mutual acceptance → hashed Commercial Agreement
6. PayPal **authorization** (funds reserved — UI says "authorized, not yet released")
7. Provider accepts work, starts, submits `customers-v1.csv`
8. Deterministic verification **FAILS** it (e.g. 7.2% duplicates, required ≤ 1%) → payment **remains protected**, policy shows DENY reason
9. Revision requested → provider submits `customers-v2.csv`
10. Verification **PASSES** with per-requirement evidence
11. Payment policy evaluates → `ALLOW` → **PayPal capture** confirmed via webhook
12. Task `COMPLETED`, payment shows **"$135 paid"**, activity timeline tells the whole story, Completion Package visible

"The failure is the proof." Step 8 is **not optional** — a demo without the caught failure does not count.

---

## 2. Scope: Hard Cut Lines

### 2.1 IN scope (build exactly this)

- Buyer app: New Task → Task Room (Outcome / State / Evidence / Money) → contract review & approval → provider recommendation → payment state → activity timeline → human-review states
- Provider portal (separate auth area): available work, requirements, accept, submit, revisions, payment status
- One task type: **dataset cleaning** with a small library of reliable deterministic checks (+ exactly one semantic/LLM check)
- Seeded providers (no marketplace, no onboarding)
- Rule-based negotiation inside a fixed budget (hybrid strategy allowed only if the deterministic path already works)
- PayPal sandbox: authorize → capture, webhook verification, idempotency, reconciliation job, kill switch
- Events via **PostgreSQL transactional outbox** + worker; SSE to browser
- Bounded workflow agent **last** (Slice 7): drives plan → search → negotiate → request authorize; human still approves the contract
- Human review for UNCERTAIN verification + 5 case types max (verification uncertainty, verification dispute, scope change, payment exception, cancellation), single admin-reviewer role

### 2.2 OUT — forbidden to build (Component 19 §36, plans 01/02/03, plan_advanced §44)

```
✗ open marketplace / provider onboarding     ✗ multi-currency, recurring work, milestones
✗ reputation algorithms / star ratings       ✗ multiple payment providers, custom escrow
✗ microservices, Kafka/event streaming, GraphQL, service mesh
✗ custom IAM / enterprise auth system       ✗ MongoDB/Cassandra/event sourcing/full CQRS
✗ analytics dashboards, ten dashboards,     ✗ elaborate messaging, dozens of settings,
  extensive analytics                         elaborate provider profiles
✗ email notification infrastructure (in-app only)
✗ second task type, arbitrary task types without deterministic verification
✗ new architecture docs, generic abstractions "for the future"
```

**"The demo needs one excellent proof, not twenty unfinished features."** Anything not in §2.1 requires a PR editing §2.1 of this file, approved by both.

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

### AI
- **I1.** AI outputs are untrusted data: schema-validated, provenance-tagged, never executed as instructions. `AI_PROPOSED` requirements cannot enter an active contract without user confirmation.
- **I2.** No LLM in the payment path. No secrets/credentials in prompts or agent context. Planner/agent tools never include `capture`, `refund`, `change_budget`, `override_verification`.

### Frontend
- **F1.** Server state is authoritative; client state is disposable. Every consequential operation goes through `/api/v1`. No business logic, payment math, or permission decisions in the frontend.

---

## 4. Prescribed Stack (frozen at Gate 0 — no re-litigating)

The agreed stack, **amended where the raw list would burn us later**. Amendments are marked ⚠ — everything else is adopted verbatim. Any dependency not listed here needs a PR + owner approval (§9.2).

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
| AI | **OpenAI Responses API + Structured Outputs** (`strict: true`) | Behind one internal `AIProvider` interface (swappable — Component 17). Timeout ~20s, 1 retry, then **deterministic fallback** (never optimistic). File content fetched via tool call, never pasted into a system prompt (I1). Owned by Engineer B |
| AI validation | **Zod** | Shared schemas live in `packages/shared` — planner, verifier, and agent all validate through the same schemas |
| Payments | **PayPal Orders v2 (authorize → capture) + Webhooks v2** | Behind internal `PaymentGateway`. `PayPal-Request-Id` header = second idempotency layer over §6.3.6. Webhook signature verification mandatory. **Two implementations: `FakePayPal`** (unit/e2e/CI/rehearsals — deterministic, no network) **+ `SandboxPayPal`** (demo). CI never depends on PayPal uptime |
| Files | **S3-compatible object storage** | MinIO locally; **Supabase Storage** hosted (S3-compatible endpoint, real presigned PUT/GET) so DB + files are one vendor. Cloudflare R2 is a fine swap. One `ObjectStorage` adapter (A). Bucket/keys are config, never code |
| Realtime | **SSE** | ⚠ Serverless platforms cut long-lived streams: the events endpoint must ship with a **cursor fallback from day one** — `GET .../events?since=` + `Last-Event-ID` reconnect + client refetch-on-reconnect. Realtime never replaces authoritative API state |
| Auth | **Auth.js** (v5, credentials) — *recommended over managed provider* | Roles (`buyer/provider/admin-reviewer`) live in **our** `users` table so authority checks stay in Postgres. Middleware gates routes for UX; **per-request `authorize()` remains authoritative** (A2). Managed auth (Clerk) only if both agree on D1 — then role sync becomes a Gate 0 task |
| Deployment | **Fit the workload to the host — not one platform for everything.** Web + API + SSE + PayPal webhook → **Vercel** · background worker → a **long-lived-process host** · data → **Supabase** | Vercel is the *compatible* host for the Next.js app, route handlers, SSE (with reconnect), and the webhook. Its functions are request-scoped, so they **cannot** host the pg-boss worker — and Hobby cron runs once/day, so don't try to force it. Worker host (pick one at Gate 0): **Railway** (default — deploy from GitHub, start command `pnpm worker`, ~$5/mo) · **Fly.io** (Docker, scale-to-zero disabled, cheapest always-on) · **always-free VM** (Oracle Cloud / GCP e2-micro, Docker) if you want $0. Dev is always `pnpm worker` locally against Supabase. If SSE ever misbehaves on Vercel, move **that one endpoint** to the worker host — it's a compatible always-on process. The worker host is the only paid piece (~$5/mo), and a free alternative exists. **Deploy spine live by D2.** |
| Testing | **Vitest + Playwright** | `invariants.test.ts` (Appendix D) + one Playwright e2e of the §1 loop **against `FakePayPal`** (green in CI); sandbox used only for demo/rehearsal |
| Observability | **Sentry + structured JSON logs** | Correlation ID via AsyncLocalStorage on every request/job; `audit_records` for economic actions; job failures alert through Sentry |
| Package manager | **pnpm** (workspaces) | No Turborepo unless build time actually hurts |
| Language | **TypeScript strict everywhere** | `strict: true`, no `any` in module interfaces |
| Dev tooling (added) | Docker Compose (postgres + minio) · webhook tunnel (ngrok) · `make` targets (`up, migrate, seed, reset-demo, test, e2e`) | Env validated by Zod at boot: **missing critical secret = startup failure**, not a half-working app (Component 18) |

**Gate 0 includes creating the PayPal sandbox developer account, app, client credentials, and a webhook tunnel** (Engineer A). PayPal sandbox friction is the #1 schedule risk — it gets done first.

---

## 5. Ownership Map

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
| Verification & acceptance | 8 | deterministic check library (dataset cleaning), one semantic check via AI adapter, per-requirement evidence, aggregation → `PASS`/`FAIL`/`UNCERTAIN`, revision triggers, human-review handoff |
| Cases (minimal) | 10 | 5 case types, blocking `case_impacts`, evidence bundle, single reviewer resolution API, `CASE_OPENED`/`CASE_RESOLVED` |
| Agent orchestrator | 11 | event-wake loop, **typed** agent actions, guards, retries/loop-detection/execution budgets, agent activity feed — **built last (M7)** |
| Event consumers | 12 | verification trigger, case→payment blocking, agent wake |
| Notifications (in-app) | — | bell + links, derived from events |
| **Entire frontend** | 16, overview, plan-02 | buyer app (shell, New Task, My Tasks, **Task Room**, contract review, provider recommendation, payments, activity, human-review states), provider portal, SSE rendering, empty/loading/error/a11y states |

### 5.3 Shared Kernel — built **together** at Gate 0 (D1–2)

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

If one engineer's milestone load is chronically ahead/behind at a gate review, both engineers may reassign a **whole module** (never a partial one) by editing §5 in a PR, with a written handoff: module state, open TODOs, owning tests. Default expectation: no rebalancing before M3.

---

## 6. The A ⇄ B Interface (frozen contracts)

### 6.1 What may never be changed unilaterally
- Event names/payloads (`packages/shared/events.ts`) — change requires: PR updates catalog + all producers/consumers + both approvals
- OpenAPI paths owned by the other engineer — propose in the spec PR, owner implements
- Shared Kernel items (§5.3) — same rule
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

**D = calendar day of the hackathon (D1–D25).** Counts assume both engineers **plus coding agents** (§9.2) — the coding agents buy throughput *inside* modules; they do not shrink gates or reviews. Order is binding: **domain → policy → integrations → UI → agent** (Component 19 §37–38 — never start with the agent).

**Gate rule:** the next milestone's *non-overlapping* work may start while a gate is pending, but **no milestone is "done" until its gate passes live**, and M7 never starts before Gate 6. Every milestone ends with a live joint demo + a written "gate passed/waived" note.

| Milestone | Days | Lead | Outcome |
|-----------|------|------|---------|
| **Gate 0** Foundation + deploy spine | D1–2 | Both | Shared kernel complete (§5.3), deployed and reachable |
| **M1** Core Task | D3–5 | A (backend) / B (planner + shell) | User → Task → Contract |
| **M2** Provider & Agreement | D6–9 | B (selection, portal) / A (negotiation) | Contract → Provider → Agreement |
| **M3** Payment Authorization | D10–12 | A / B (payment UI) | Agreement → PayPal Authorization |
| **M4** Execution & Submission | D13–14 | B / A (files) | Authorized work → immutable Submission |
| **M5** Verification & Failure | D15–17 | B / A (policy deny path) | Submission → FAIL → revision → PASS |
| **M6** Settlement | D18–19 | A / B (money UI) | PASS → Policy → PayPal Capture |
| **M7** Agent | D20–21 | B / A (authority guards) | Autonomous bounded loop |
| **H** Harden & Demo | D22–24 | Both | e2e, invariant suite green, demo rehearsals |
| **Buffer** | D25 | — | Only cut-lines (§10) may consume it |

### Gate 0 — Foundation & deploy spine (D1–2) · both
- [ ] `docker compose up` runs web+worker+postgres+minio from a clean clone
- [ ] Full draft schema + migration runner + seeds; event catalog committed; OpenAPI generated from Zod in CI
- [ ] Auth: login as buyer/provider/admin-reviewer; `authorize()` rejects cross-user access
- [ ] Outbox: a test domain write + event land in the same transaction; worker publishes via pg-boss; SSE stub streams it **on deployed infra, with `?since=` reconnect proven**
- [ ] **PayPal sandbox app created, credentials in env, `/health`+`/ready` green** (A); `FakePayPal` + `FakeAI` wired behind their interfaces
- [ ] Zod → OpenAPI → frontend-client generation pipeline runs in CI
- [ ] **Deploy spine live**: Vercel preview + Supabase (DB + storage) + worker deployed to a long-lived host (default Railway, §4) + webhook endpoint reachable; SSE and webhook round-trip proven on real infra
- [ ] `invariants.test.ts` exists, red by design

### M1 — Core Task (D3–5): *User → Task → Contract*
**A:** `POST/GET /api/v1/tasks` (idempotent, immutable request, minor-unit money, deadline UTC) · planner job trigger · contract compiler (reject incomplete/unconfirmed-AI specs) + `POST /contracts/{id}/approve` bound to version+hash · activity endpoint v1 · tasks lifecycle transitions
**B:** Next.js shell (nav: Tasks/Payments/Activity/Settings) · New Task composer + upload · planner (LLM structured output, provenance, ≤3 materially-important clarifications) · contract review screen (plain language, budget ceiling, **agent can/cannot** panel) · "AI planning" progress state · SSE → live status
- [ ] Gate: create task from NL + file → spec with provenance tags → contract review → approve → `tasks.status = APPROVED`; approving an *older* contract hash is rejected; two identical creates with one Idempotency-Key create one task
- [ ] Forbidden: provider code, payment code, agent

### M2 — Provider & Agreement (D6–9): *Contract → Provider → Agreement*
**B:** seeded providers + capabilities/availability · deterministic eligibility (fail reasons persisted) · ranking + **"why we selected them"** response · `provider-search` internal endpoint · provider portal: login → available work → accept (bound to contract version+hash) → work status
**A:** negotiation state machine (round caps), immutable offers, authority-envelope validation (budget/deadline/currency/rounds), scope-change → amendment (not silent), `COMMERCIAL_AGREEMENT_CREATED` (both acceptances + SHA-256), negotiation UI-facing endpoints
- [ ] Gate: approved contract → provider recommended with reasons + alternatives → offer/counteroffer within budget → agreement hashed; a counteroffer **over budget is refused deterministically** and surfaces "Needs your attention" state; provider acceptance recorded against the exact contract version
- [ ] Forbidden: any PayPal call, any LLM-authored offer accepted without deterministic validation

### M3 — Payment Authorization (D10–12): *Agreement → PayPal Authorization*
**A:** payments created **only** from a validated agreement (amount/hash/version copied, never re-typed) · authorize policy evaluation → `ALLOW`/`DENY` + reasons · PayPal adapter (orders create + authorize, idempotency keys) · webhook verify/dedup → domain events · reconciliation job for UNKNOWN states · kill switch · `GET /tasks/{id}/payment`
**B:** payment panel: **"$135 authorized through PayPal — released only after verification"** (never "paid") · payments list page · Needs-your-attention styling for DENY
- [ ] Gate: agreement → policy ALLOW → sandbox authorization succeeds → `payments` row + external IDs + `payment_operations` appended; replaying authorize with the same idempotency key creates **one** payment; tampered amount from the client changes nothing (policy DENYs)
- [ ] Forbidden: capture before M6 (feature-flagged off), refunds, milestones

### M4 — Execution & Submission (D13–14): *Authorized work → Submission*
**B:** provider portal detail view (pay, deadline, requirements checklist, input file, payment condition) → Accept → Start → **Submit Deliverable** upload flow · pre-submission validation · clarification requests (buyer-routed) · revision cycle UI · immutable submission versions (checksum, provenance) · `SUBMISSION_SUBMITTED`
**A:** signed upload/download URLs, storage adapter, artifact metadata + SHA-256, file access control (provider sees only their task's files), task file endpoints
- [ ] Gate: provider accepts → uploads CSV → submission v1 immutable (re-upload creates v2, never overwrites) → buyer sees Work Status + submission appear; provider A cannot fetch provider B's file URL
- [ ] Forbidden: verification logic (only emit the submission event)

### M5 — Verification & Failure (D15–17): *Submission → FAIL → PASS*
**B:** verification engine: load **exact contract version** snapshot → deterministic checks (row count, duplicate rate ≤1%, ID preservation, required fields, email normalization schema) + one semantic check → per-requirement `PASS/FAIL` with evidence rows → aggregate via acceptance policy → `VERIFICATION_PASSED/FAILED/UNCERTAIN` · revision requested on FAIL · UNCERTAIN → case opened (blocking) + reviewer resolution endpoint · verification UI (expected vs actual, evidence, "payment protected" banner)
**A:** payment policy consumes verification + case events: full deny-path wired (FAIL/UNCERTAIN/no-decision/blocking case → `DENY` + persisted reason) · policy check records readable in UI · escalation freeze honored
- [ ] Gate (demo money protection): submitted v1 → **FAIL** (7.2% vs ≤1%) → capture attempt returns `PAYMENT_NOT_ELIGIBLE` with stored reason → v2 submitted → **PASS** with evidence → policy flips to `ALLOW` (capture still gated to M6); UNCERTAIN case blocks capture while open
- [ ] Forbidden: changing acceptance criteria after contract approval (the check compares against the contract snapshot — provider cannot be failed against a requirement that didn't exist)

### M6 — Settlement (D18–19): *PASS → Policy → Capture*
**A:** capture path: full 12-check policy evaluation → immutable `PaymentDecision` + `CaptureCommand` → PayPal capture → webhook confirms → `PAYMENT_CAPTURED` → reconciliation for unknowns → task terminal transition (A's `tasks.transition()`) · crash/duplicate drills
**B:** Task Room money states (authorized → released) with exact timing of when money moved · activity timeline full narrative (the 13:02→13:12 sequence from the overview) · payments page statuses (authorized/captured/failed/pending)
- [ ] Gate: PASS → ALLOW → capture → PayPal confirms → task `COMPLETED` → timeline shows the full story; **drill 1:** capture retried after simulated crash → still exactly one capture; **drill 2:** webhook replayed → no double state change; **drill 3:** `SYSTEM_PAYMENT_PAUSE=true` blocks capture
- [ ] Forbidden: any UI element implying payment before capture confirmation

### M7 — Agent (D20–21): *Bounded autonomy*
**B:** event-wake agent loop (observe → context → propose → validate → execute → record) with **typed actions only** (`CREATE_PLAN`, `SELECT_PROVIDER`, `PROPOSE_OFFER`, `REQUEST_AUTHORIZATION`, `REQUEST_VERIFICATION`, `REQUEST_REVISION`) · WAIT as a valid action · loop detection + bounded retries + execution budget · agent activity feed ("decision provenance", not chain-of-thought) · planner output drives contract proposal automatically
**A:** agent identity + per-task authority policy (spend cap = contract budget, round caps, revocation) · guard enforcement (attempted out-of-scope action → `AGENT_AUTHORITY_DENIED` + audit record) · confirm agent **cannot** capture or bypass contract approval (human approval stays)
- [ ] Gate: fresh task → agent drives plan → human approves contract → agent selects/negotiates/authorizes → work runs → verification gates → capture — with zero invariant violations; agent attempting `capture` or `change_budget` is denied and audited; agent gets stale context → re-reads state instead of acting (state-freshness check)
- [ ] Forbidden: new agent tools not in the typed list; agent writing to any table directly

### H — Harden & Demo (D22–24): *both*
- [ ] Playwright e2e runs the §1 16-step loop green (against `FakePayPal` in CI **and** once against sandbox PayPal from a clean clone)
- [ ] `invariants.test.ts` fully green (Appendix D)
- [ ] UX polish pass: empty/loading/error states, keyboard nav, the four Task Room layers (Outcome/State/Evidence/Money) legible at a glance
- [ ] Demo recorded twice, timed ≤ 6 minutes, failure step included; judge Q&A prepared (§8.4)
- [ ] `/ready`, logs with correlation IDs, seed-reset script (`make reset-demo`) verified

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
- Every LLM call: schema-validated output, provenance tagged, timeout+retry, malformed output → retried → then deterministic fallback (never optimistic)
- Verification compares against the **contract snapshot**; evidence persisted per requirement; FAIL produces a user-readable expected-vs-actual explanation
- Frontend computes zero authoritative values (amounts, permissions, verdicts) — reads API only; provider user cannot reach buyer-only routes (tested)
- Main green daily; event catalog changes proposed with payloads + both approvals

### 8.4 System DoD (demo checklist mapped to judging questions)
| Judge asks | System must show | Gate |
|---|---|---|
| "What is the agent allowed to do?" | Contract + authority panel, agent-can/cannot list, `AGENT_AUTHORITY_DENIED` audit | M1, M7 |
| "Why did the work pass?" | Per-requirement evidence vs exact contract version | M5 |
| "Prove why money moved" | `PaymentDecision` + policy checks + capture only after PASS, timeline | M6 |
| "What happens when it fails?" | FAIL → payment protected → revision → PASS → capture | M5→M6 |
| "Will it refuse unsafe work?" | Over-budget counter refused; UNCERTAIN blocks capture | M2, M5 |

All five answered live from the product UI, not from code.

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

## 10. Cut-Lines (ordered — cut from the top, never from the bottom)

If the schedule slips, remove scope **in exactly this order**, one item per day of slip, both engineers agreeing:

1. In-app notification bell (activity timeline remains)
2. Clarification Q&A loop → fixed two questions from the planner
3. Multiple negotiation rounds → single offer + single accept (still via immutable offer objects)
4. Semantic/LLM verification check → deterministic checks only
5. Ranking sophistication → single seeded provider, selection rationale still shown
6. `UNCERTAIN` human-review UI → UNCERTAIN blocks capture and routes to one reviewer screen with Approve/Reject (no case messages/evidence UI)
7. Agent autonomy depth (M7) → agent drives plan + provider search only; the rest stays button-driven **but the demo keeps agent-authored planning**
8. Provider portal polish → single provider page (accept/start/submit/revise stacked)

**Never cut (system is undemoable or unsafe without these):**
- contract review + human approval before authorization · capture gated on PASS (P1/P2) · idempotent money operations · webhook verification · immutable submissions · activity timeline (even as raw events) · the intentional verification failure in the demo · authorization-vs-capture distinction in UI copy

The schedule has exactly **one buffer day (D25)**. Each lost day: consume the buffer first, then apply the next cut-line from the list below, both engineers agreeing. Never skip Gates 3, 5, or 6, and never start-then-abandon — if a milestone must shrink, cut *before* it starts.

If runway is < 25 days from the outset, apply cut-lines proactively at the milestone boundaries (start with #1, #2, …) and re-issue the schedule in §7 via a PR to this file.

---

## 11. Risk Register

| # | Risk | Owner | Mitigation | Trigger date |
|---|------|-------|-----------|--------------|
| R1 | PayPal sandbox setup/webhook tunnel friction | A | Done at **Gate 0**; `FakePayPal` unblocks all other work regardless | D2 |
| R2 | LLM structured output unreliable → planner stalls | B | Deterministic fallback spec from a template; validation pipeline; test with 10 canned prompts; `FakeAI` for everything non-demo | D5 |
| R3 | Verification false positive/negative on the demo dataset | B | Fix golden dataset + expected results as a fixture test before M5 gate | D17 |
| R4 | A/B interface drift (events/schema/OpenAPI) | Both | Frozen catalog + Zod-generated OpenAPI pipeline (Gate 0); daily integration; schema owner approval | continuous |
| R5 | Scope creep from 36k lines of architecture docs | Both | §0 rule: no new docs; anything beyond §2.1 needs a §2.1 edit | continuous |
| R6 | Frontend load outweighs backend near the end | Both | §5.4 rebalance clause considered at M3 review | D12 |
| R7 | Demo-day data corruption / broken seed | Both | `make reset-demo`; never demo on dev data; recorded backup demo | D21 |
| R8 | Platform mismatch: SSE streams cut on Vercel, worker unusable on serverless, DB cold starts | A | Workload-to-host fit fixed in §4 (worker on a long-lived host); deploy spine live at **D2** (§5.3.10); `Last-Event-ID`/cursor fallback on every realtime endpoint; pooled DB connections for serverless; smoke test SSE + webhook daily from D2 | D2 |
| R9 | Coding-agent velocity creates unreviewed surface area | Both | §9.2 protocol: context packs, same-day reviews, dependency budget, invariants suite as the safety net; human edge-case test per agent PR | continuous |

---

## Appendix A — Initial Event Catalog (freeze at Gate 0)

Producer owns the payload; consumers listed are the only ones that must react. Full envelope (id, correlation, causation, actor, version) per Component 12.

| Event | Producer (owner) | Consumers |
|-------|------------------|-----------|
| `TASK_CREATED` | A | B (planner), A (activity) |
| `WORK_SPEC_CREATED` / `CLARIFICATION_*` | B | A (contract compile), B (UI) |
| `CONTRACT_APPROVED` | A | B (provider search), B (activity), B (agent) |
| `PROVIDER_SEARCH_STARTED` / `PROVIDER_SELECTED` / `PROVIDER_SELECTION_FAILED` | B | A (negotiation), activity |
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

## Appendix C — Endpoint Ownership (list every endpoint here at Gate 0)

**A:** `POST/GET /api/v1/tasks` · `POST /api/v1/tasks/{id}/files` (signed URL) · `GET /api/v1/tasks/{id}/activity` · `GET /api/v1/tasks/{id}/events` (SSE) · `GET /api/v1/contracts/{id}` · `POST /api/v1/contracts/{id}/approve` · `POST /api/v1/negotiations` · `POST /api/v1/negotiations/{id}/offers` · `POST /api/v1/negotiations/{id}/respond` · `GET /api/v1/tasks/{id}/payment` · `POST /api/v1/payments/{id}/authorize` · `POST /api/v1/payments/{id}/capture` (internal, policy-gated) · `POST /api/v1/webhooks/paypal` · `GET /api/v1/payments` · `GET /health` · `GET /ready` · auth/session endpoints

**B:** `POST /api/v1/tasks/{id}/plan` (internal) · `GET/POST /api/v1/tasks/{id}/clarifications` · `GET /api/v1/tasks/{id}/provider-selection` · `POST /api/v1/tasks/{id}/provider-search` (internal) · `GET /api/v1/provider/work` · `POST /api/v1/provider/work/{id}/accept` · `POST /api/v1/provider/work/{id}/start` · `POST /api/v1/submissions` · `GET /api/v1/submissions/{id}/verification` · `POST /api/v1/verifications/{id}/review` · `GET/POST /api/v1/cases` · `POST /api/v1/cases/{id}/resolve` · `GET /api/v1/notifications` · agent endpoints (M7)

The frontend consumes **only** `/api/v1` + SSE. Generated types from `docs/openapi.yaml` — no hand-written client types. Route handlers live in `apps/web/app/api/v1/**`; ownership follows the path prefix above (A owns the `/tasks`, `/contracts`, `/negotiations`, `/payments`, `/webhooks` segments; B owns `/provider`, `/submissions`, `/verifications`, `/cases`, `/notifications` and the agent endpoints).

## Appendix D — Invariant Test Suite (`invariants.test.ts`, red at Gate 0, green by H)

| Test | §Ref | Owner | Target |
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
| LLM malformed output → retry → deterministic fallback (never PASS-by-default) | I1 | B | M1 |
| Outbox: state + event atomic; duplicate delivery → consumer no-op | D1 | A | Gate 0 |
| Submission re-upload creates new version; v1 bytes unchanged (checksum) | D2 | B | M4 |
| `SYSTEM_PAYMENT_PAUSE=true` → capture blocked | P3 | A | M6 |

---

*End of plan. The architecture is written; the split is fixed; the gates are testable. Now we build the thing.*
