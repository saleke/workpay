# WorkPay

WorkPay is a user-led workspace for turning an informal request for professional work into clear,
versioned terms and an observable delivery process.

AI helps interpret and organize what someone needs. It does **not** choose or contact a
professional, create binding requirements, accept commercial terms, judge professional quality,
or move money on a user's behalf.

## Product model

```text
Explain the work
  → confirm the interpretation
  → clarify material unknowns
  → approve an exact brief and budget meaning
  → review available professional profiles
  → approve one recipient and the exact first message
  → professional accepts or declines contact
  → both parties agree any commercial terms or changes
  → professional accepts and performs the assignment
  → evaluate evidence against the agreed criteria
  → optionally use a mutually agreed independent reviewer
  → apply deterministic payment policy
```

No earlier step implies consent to a later one.

## Why it exists

Requests for work often begin with incomplete or ambiguous language. That creates risks for both
the person requesting work and the person performing it:

- an AI can invent requirements or infer a budget;
- messages can be mistaken for contract changes;
- a professional can be contacted without informed consent;
- submitted work can be confused with accepted work;
- subjective quality can be presented as an automated fact;
- payment actions can be triggered from stale or uncertain state.

WorkPay makes those boundaries explicit and records the evidence behind consequential decisions.

## Core safeguards

- **Source-grounded intake:** the original request is preserved and AI output carries exact-source
  provenance.
- **Explicit confirmation:** AI proposals remain nonbinding until the user confirms or edits them.
- **Versioned terms:** approved briefs and contracts are bound to immutable versions and hashes.
- **User-controlled contact:** profiles are shown without automatic selection or endorsement;
  contact requires approval of the recipient, terms, and exact message.
- **Mutual changes:** chat messages do not amend an agreement. Structured changes require the
  other participant's acceptance and explicit activation.
- **Scoped independent review:** a reviewer is optional, chosen by the parties, conflict-checked,
  and limited to the agreed criteria and materials.
- **Deterministic payment policy:** AI cannot authorize or capture payment. FAIL, UNCERTAIN, stale
  versions, unresolved changes, and blocking exceptions fail closed.
- **Recoverable external operations:** unknown external outcomes are reconciled rather than
  guessed or blindly retried.

## Payment status

**Live money movement is intentionally disabled.**

The current application uses a deterministic fake gateway to validate agreement amounts,
authorization states, acceptance gates, idempotency, capture policy, and failure recovery. A
displayed authorization or capture is a simulation; no funds are charged, held, captured, or paid.

PayPal OAuth identity data is not treated as permission to charge an account, a payout mandate, or
independent identity verification. A production payment integration requires a separately approved
marketplace payment design and explicit buyer approval at the payment provider.

WorkPay does not currently provide escrow, a wallet, merchant-of-record services, or arbitration.

## Architecture

WorkPay is a TypeScript modular monolith:

```text
apps/
├── web/       Next.js 15 application, UI, and /api/v1 route handlers
└── worker/    Long-running outbox, verification, and recovery processing

packages/
└── shared/    Domain services, Zod contracts, Drizzle schema, events, and integrations
```

- **Frontend/API:** Next.js 15, React 19, TypeScript, Tailwind, Radix-based components
- **Database:** PostgreSQL 16 with Drizzle ORM
- **Events:** transactional PostgreSQL outbox
- **Files:** local or S3-compatible object storage with SHA-256 artifact identity
- **AI intake:** Cloudflare Workers AI or Vercel AI Gateway, disabled by default
- **Payments:** deterministic simulation only
- **Tests:** Vitest; database-backed tests are opt-in

PostgreSQL is authoritative. Browser state, AI context, realtime events, and external-provider
responses are never accepted as authority without server-side validation.

## Local setup

### Requirements

- Node.js 22+
- pnpm 9+
- Docker with Docker Compose

### Install and run

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm reset-demo
pnpm worker
```

In a second terminal:

```bash
pnpm dev
```

Open `http://localhost:3000`.

The default environment uses demo identities, local PostgreSQL/object storage, disabled live intake
AI, and simulated payments. Configure one of the supported intake AI providers only when testing
model behavior; invalid output leaves the persisted draft unchanged.

## Validation commands

```bash
pnpm typecheck
pnpm test
pnpm build
```

Database-backed tests reset the configured database. Run them only against a disposable test
database:

```bash
RUN_DB_TESTS=1 DATABASE_URL=postgres://... pnpm --filter @workpay/shared test:integration
```

## AWS Free Plan test deployment

The deployment in `deploy/` runs the web application, worker, and PostgreSQL on one EC2 instance
behind Caddy. Task artifacts and off-VM database backups use a private S3 bucket through the EC2
instance role; no long-lived AWS access keys are stored by WorkPay.

1. Create an AWS Free Plan account and install/authenticate AWS CLI v2 locally.
2. In AWS Settings, open **Project → Additional Info** and copy the project's fixed Region. Export
   that exact `AWS_REGION` plus a globally unique `S3_BUCKET`, then run
   `deploy/aws/create-vm.sh`. Managed Free Plan projects deny regional API calls outside this fixed
   Region.
3. Point the chosen test subdomain's A record to the printed static IP.
4. Connect through AWS Systems Manager Session Manager and run `deploy/aws/bootstrap-vm.sh` with `sudo`.
5. Clone this repository into `/opt/workpay`.
6. Copy `deploy/.env.production.example` to `deploy/.env.production` and fill its secrets.
7. Run `deploy/deploy.sh`.
8. Run `deploy/seed-test-users.sh` once to create separate test identities.

Do not expose PostgreSQL or the worker publicly. Keep the application-level basic-auth boundary
enabled until browser-level authorization tests are complete. Schedule `deploy/backup-postgres.sh`
daily and create an EBS snapshot before destructive test resets or migration experiments.

## Current maturity

The versioned intake system is the most mature part of the product. Candidate contact,
collaboration, amendments, independent review, execution, and payment-policy simulation are under
active integration and require browser-level validation before release.

See `architecture/ENGINEERING_PLAN.md` for the current product scope, invariants, and delivery
gates. Older autonomous-agent and dataset-cleaning documents are historical context where they
conflict with that plan.
