# Tenfo

### Good work starts with a clear agreement.

Tenfo lets someone start by describing the need they have—even when they do not
know the technical details of the work. AI-guided intake helps people unfamiliar
with the task domain work through essential questions and shape their answers
into a reviewable brief. People who already know the domain can state precise
requirements directly; the requester decides what to confirm and who to contact.

Tenfo is a user-led platform for making professional work clearer and more
accountable. This version is being prepared for the PayPal Hackathon as a
demonstration of that broader product vision. **It does not currently move
money**; the beta is a working prototype, not a claim that every marketplace,
identity, or payment capability is production-ready.

**[Explore the Tenfo beta](https://workpay-beta.56.228.111.53.sslip.io/)**

At sign-in, use the available demo/evaluator entry points to explore requester
and professional perspectives. These are ways to try the workflow, not separate
permanent account types. You can also create an account and use your own profile.
Demo data is for evaluation; do not enter sensitive or real client information.

## The problem Tenfo addresses

People often know what they need without knowing the technical language or
scope used by that profession. Tenfo lets them start with a simple,
plain-language description; AI-guided intake helps surface details that matter
for discussing the work. Experienced requesters can give precise requirements
from the start. In either case, people review what belongs in the brief and
choose whether to contact a professional.

Tenfo keeps the original request distinct from AI suggestions and
user-confirmed decisions. It connects collaboration to the approved version of
the work and avoids treating messages, submissions, or opinions as consent to a
later action.

## How the workflow works

```text
Describe the work
  → review and correct the interpretation
  → resolve material unknowns and confirm budget meaning
  → prepare, edit, and approve a versioned brief
  → review proposed terms and approve them
  → consider professional profiles ordered by self-described scope overlap
  → choose a professional and approve the exact contact message
  → professional responds; parties agree before commercial commitment
  → collaborate, submit work, and review it against agreed criteria
  → optionally involve an independent reviewer by mutual agreement
```

### 1. Describe and clarify

The requester starts with their own wording. AI can help organize it, identify
important unanswered questions, and prepare a professional-facing brief. The
requester can review and correct the interpretation, answer relevant questions,
and explicitly decide what their budget means—including leaving it undecided.
Tenfo should not infer a spending limit, silently convert currencies, or treat
an AI proposal as a confirmed requirement.

Intake answers are private. The professional brief is a separate, reviewable
artifact with source evidence; the requester can edit and approve the exact
version that will be used. An AI failure should leave the draft recoverable and
must not mark it ready or approved.

### 2. Choose who to contact

After the requester approves the work scope and terms, Tenfo presents available
professional profiles as information for the requester to consider. Profiles
with self-described capability labels that overlap the approved scope may appear
first, while every eligible profile remains available. This deterministic
ordering is not verification, endorsement, automatic selection, or a guarantee
of availability or fit. The requester chooses who—if anyone—to contact.

Before contact, the requester reviews the recipient and exact message. Approval
of a brief or terms alone does not search for, select, or contact a professional.

### 3. Continue the conversation around the work

Messages are organized around people and their work conversations, so multiple
tasks with the same person do not become an indistinguishable task list. Work
context can be opened when needed rather than permanently taking over the
conversation view. A conversation does not silently amend an agreement.

The professional can respond to the initial request. Work messaging becomes
available after the professional accepts contact. The parties remain in control
of any commercial commitment and any proposed changes to scope or terms.

### 4. Deliver and review

The work lifecycle is designed to connect submissions and evidence to the
agreed requirements and applicable agreement version. A submission is not
automatically accepted. Where independent review is used, it is optional and
requires agreement on the reviewer, scope, criteria, and version being reviewed.
The reviewer provides an attributable opinion—not Tenfo certification,
arbitration, or a command to release payment.

Requester, performing professional, and reviewer describe task-specific
relationships. A Tenfo member can participate in different capacities on
different work, subject to ownership, consent, and conflict checks.

## Product principles

- **People own consequential decisions.** AI can assist with organization; it
  cannot choose or contact a professional, create binding requirements, accept
  terms, judge work quality, or authorize payment.
- **Preserve provenance.** Keep original wording, AI proposals, user corrections,
  confirmed details, and approved versions distinguishable.
- **Make consent step-specific.** Approval of one stage does not imply consent to
  contact, changed terms, work acceptance, or payment at a later stage.
- **Keep work and communication connected.** Messages and decisions should be
  associated with the relevant person and task without confusing separate work.
- **Represent uncertainty honestly.** A self-described profile is not a
  verified credential; an uncertain result is not success; a simulated payment
  is not a transaction.

## PayPal Hackathon and payment scope

Payment workflows are enabled, including agreement-linked payment states,
server-side policy checks, idempotency, and recovery handling. The current
environment uses a simulated payment gateway: **no PayPal charge, authorization,
hold, capture, payout, or transfer occurs**. Payment states shown in the demo
represent policy validation, not funds moving.

Tenfo is not a wallet, escrow service, merchant of record, or
dispute-resolution provider. Current payment-policy validation is USD-only; the
requester's stated currency must be preserved, and any unsupported currency
made explicit rather than silently converted.

## Current status and limitations

Tenfo is actively being validated as an integrated user-led lifecycle. The
repository includes server-owned, versioned intake; AI-assisted interpretation
and brief composition; task and agreement flows; professional discovery and
contact consent; task-linked messaging; work submission/review surfaces; and
payment-policy infrastructure with simulated operations.

Important limitations for evaluators and contributors:

- External intake AI is **disabled by default** in the local example
  configuration. Configure a supported provider to exercise live model
  assistance; availability, quality, latency, and cost depend on that provider.
- The evaluation corpus is an initial regression foundation, not statistical
  evidence of broad model performance. Broad quality and usability claims have
  not been established.
- Optional integrations, including identity verification and external storage,
  are configuration- and provider-dependent. Self-reported profile information
  should not be read as certified credentials.
- Some development and evaluator experiences use seeded/demo data. Do not use
  the beta as a source of production payment, identity, or dispute outcomes.
- The system does not provide WorkPay/Tenfo arbitration. Reviewer opinions are
  attributable evidence against agreed criteria, not a final adjudication.

The current implementation scope and engineering gates are documented in
[`architecture/ENGINEERING_PLAN.md`](./architecture/ENGINEERING_PLAN.md).
Decision notes are in [`OPEN-DECISIONS.md`](./OPEN-DECISIONS.md).

## Technology and architecture

- **Web:** Next.js App Router, React, TypeScript, Tailwind CSS
- **API and domain:** Next.js route handlers backed by shared domain services
- **Data:** PostgreSQL, Drizzle ORM, append-only migrations
- **Background work:** separate Node.js worker using `pg-boss`
- **AI:** schema-validated integrations; provider selection is environment
  configured and intake AI is off by default
- **Files:** local S3-compatible MinIO for development; hosted object storage is
  configurable
- **Payments:** provider abstraction with simulated gateway for the current
  validation scope
- **Quality:** Vitest for unit and shared-domain tests; Playwright for web
  end-to-end tests

The repository is a pnpm workspace:

```text
apps/
  web/                 Next.js application and API routes
  worker/              Background job process
packages/
  shared/              Domain services, schemas, database, events, integrations
architecture/          Engineering plan and supporting references
deploy/                 Deployment configuration and operational scripts
```

The customer-facing product is branded Tenfo; repository paths and internal
workspace package names such as `@workpay/shared` retain their existing
technical names.

The main product and safety invariants are captured in the engineering plan.
In particular, routes validate and authorize before calling domain services,
state-changing decisions are server-owned, model calls do not run inside
database transactions, and money-related operations are rechecked at policy
boundaries.

## Run locally

### Requirements

- Node.js **22 or newer**
- pnpm **9 or newer**
- Docker Compose

### Start the local stack

From the repository root:

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

The compose stack starts PostgreSQL and MinIO and creates the local artifacts
bucket. `.env.example` contains development defaults. Review it before use and
keep real credentials in an untracked local environment file—never commit
secrets.

Start the web app:

```bash
pnpm dev
```

The default URL is [http://localhost:3000](http://localhost:3000), as set by
`APP_URL`. If your local configuration uses another port, open that configured
URL instead.

Start the worker in a second terminal when exercising background jobs:

```bash
pnpm worker
```

The local example uses simulated payments and disables external intake AI.
Configure optional providers in your local `.env` only when you intend to test
those integrations. Keep credentials server-side and out of source control.

## Try the product

For a focused evaluation, follow a single work request from the requester
perspective:

1. Start with a realistic but non-sensitive request in the requester workflow.
2. Review the interpretation; correct any assumption that does not match your
   intent.
3. Answer material scope questions and make the budget meaning explicit, or
   leave it undecided.
4. Prepare the professional brief, inspect its evidence and wording, and edit
   it before approval if needed.
5. Approve the brief and terms explicitly. Notice that this does not contact a
   professional or authorize payment.
6. Consider the available profiles, choose whether to contact someone, then
   review the exact message before approving it.
7. Switch to a professional perspective to inspect the request and respond.
   Continue in the task conversation only after contact is accepted.
8. Explore work submission, review, and payment-policy states while remembering
   that money movement is simulated.

The beta sign-in page provides demo/evaluator entry points when enabled. Use
those perspectives to inspect the same workflow from different sides; avoid
assuming the demo identity or seeded records represent real participants.

## Validate changes

From the repository root:

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` runs the shared package test suite. For web end-to-end tests:

```bash
pnpm --filter @workpay/web e2e
```

The end-to-end suite may require the local app and its test services to be
available. Database-backed integration tests are opt-in:

```bash
pnpm --filter @workpay/shared test:integration
```

Run integration tests only against a disposable test database; they may modify
or reset data. Other useful commands:

```bash
pnpm --filter @workpay/web lint
pnpm --filter @workpay/shared typecheck
```

## Contributing and safety

Before changing product behavior, consult the document authority and current
scope in the engineering plan and check [`OPEN-DECISIONS.md`](./OPEN-DECISIONS.md)
for unresolved decisions. Preserve the separation between proposals, user
decisions, executed actions, and externally confirmed outcomes.

Never put credentials, private user data, or production records in source code,
tests, screenshots, issue reports, or demo fixtures. For reports involving
access control, payment, identity, or privacy, use the project's responsible
security-review process rather than publicly disclosing sensitive details.

## License

Tenfo is licensed under the MIT License. See [`LICENSE`](./LICENSE) for the
license text.
