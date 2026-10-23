# WORKPAY
## Product Experience & UI/UX Implementation Specification

Corrected to align with the supplied WorkPay architecture, master build prompt, engineering plan, and component specifications.

**Core product thesis:** *“I tell the agent what I need done, approve, add, edit or removefrom the list of  what it proposes, and monitor the result.”*

Version 1.0 | Implementation guidance for the coding agent

---

## 1. Governing Product Understanding
WorkPay is an AI-powered economic execution system, delivered through a browser-based application. It translates human intent into a bounded, reviewable task; proposes a contract and provider; coordinates execution; evaluates evidence against acceptance criteria; and permits settlement only when the applicable policy and verified state allow it.

The product is task-centric, not a generic freelancer marketplace. The interface should conceal internal orchestration complexity while making user authority, task state, evidence, exceptions, and economic consequences legible.

The product promise is: **Commit → Execute → Prove → Settle.** Money follows proof.

The primary object is the **Task**. A task is the continuous record for intent, inputs, specification, contract, provider, execution, deliverables, verification, payment state, activity, and evidence.

The user remains in control of consequential commitments. AI can interpret, recommend, coordinate, and act only within explicitly granted authority.

WorkPay does not provide a wallet. PayPal is the payment rail and the documented escrow/payment arrangement is external to WorkPay.

The buyer/task owner application and provider application are separate authenticated surfaces within the same browser-based product.

The initial product must be narrow in breadth but deep in correctness. Do not replace real workflow, verification, or payment logic with mock success states.

---

## 2. What the Interface Is and Is Not

### The interface is:
* A control room for task execution, with clear next actions and exceptions.
* A transparent record of what the user asked for, what was agreed, what the system did, what evidence exists, and what happens next.
* A consent and authority surface for scope, budget, provider/contract approval, and payment-related actions.
* A reliable monitoring surface for asynchronous work and external integrations.

### The interface is not:
* A conventional gig marketplace whose main purpose is browsing worker profiles.
* A chat app with payment features bolted on.
* A wallet, stored-value account, or internal funds-transfer system.
* A dashboard that exposes every internal agent, queue, service, or orchestration implementation detail.
* A UI that claims work is verified, funds are held, or payment is complete before authoritative state confirms it.

---

## 3. Primary User Journeys

### Buyer / Task Owner Journey
* Describe the outcome they want and provide any relevant files or context (file upload should be supported.
* Review the AI's interpretation and answer clarification questions.
* Review a structured task specification: deliverables, acceptance criteria, verification method, deadline, budget ceiling, exclusions, and relevant constraints.
* Review provider recommendation and proposed contract/terms. Explicitly approve the commitment and any required PayPal authorization step.
* Monitor execution through a timeline with meaningful milestones, not internal technical noise.
* Review submitted deliverables and requirement-by-requirement verification evidence.
* If verification fails, inspect the failed criteria and follow the supported revision path. If verification is uncertain or an exception occurs, resolve or escalate through the defined human-review flow.
* See settlement state derived from confirmed PayPal and backend events. Do not imply that user approval alone proves funds were captured or released.

### Provider Journey
* Enter the provider-specific authenticated area and review eligible work or an assigned task.
* Inspect the task brief, agreed scope, deliverables, deadlines, acceptance criteria, and relevant contract version.
* Accept or decline the commitment where supported.
* Execute the task and submit deliverables plus evidence required by the specification.
* See verification results and any revision request with actionable, criterion-linked feedback.
* Track final task and settlement status without being shown unsupported promises about payment.

---

## 4. Information Architecture
Use a consistent product shell, but render the appropriate buyer or provider experience according to authenticated permissions and context. Do not use a global worker/hirer role selector if the architecture does not call for one; provider and buyer are task relationship concepts, not a reason to mix permissions.

* **Buyer surface:** Home, Tasks, Activity/Notifications, Settings.
* **Provider surface:** Work queue, Task detail, Submissions, Activity/Notifications, Settings.
* **Task detail** is the canonical workspace and should contain Overview, Specification/Contract, Execution, Deliverables & Verification, Payment, and Activity/Evidence sections or tabs.

Keep global navigation short. Avoid creating separate top-level pages for every backend service.

Messages or clarification threads should be contextual to a task wherever possible, so decisions remain attached to the record.

Do not introduce a separate wallet, wallet balance, deposits, withdrawals, internal transfers, or wallet transaction ledger as a user-facing feature.

---

## 5. Home Dashboard
The Home screen should answer three questions quickly: *What is happening? What needs my attention? What can I safely do next?*

### Recommended Composition
* Top greeting and concise system summary, without over-personalized marketing copy.
* Primary create-task input: a large natural-language prompt such as “What do you need done?” with attachment support where available.
* **Attention queue:** clarification needed, specification ready for review, contract awaiting approval, task blocked, deliverable ready to review, verification uncertain, payment exception.
* **Active tasks:** compact cards showing outcome title, current state, next milestone, deadline if known, and a single next action.
* **Recent activity:** meaningful human-readable events tied to tasks.
* Optional spending/commitment summary only when derived from real task/contract/payment data. Never frame it as a wallet balance.

Do not use vanity metrics as the dominant content. The next required action should be more prominent than aggregate counts.

---

## 6. Task Creation and AI Clarification
Start with an open-ended natural-language request. Do not force users to complete a long form before the system has interpreted their intent.

Allow supporting file uploads only when the underlying upload and security pipeline exists; show upload progress and processing/failed states.

The AI should summarize its interpretation in plain language and ask targeted clarifying questions when requirements are underspecified.

Clearly distinguish user-provided facts, AI-inferred assumptions, and unresolved questions.

Do not silently convert an ambiguous request into a binding contract or spend commitment.

And you dont have to suffer the user to enter title seperately, this should be authomatically generated

Before proceeding, present a structured specification that can be edited and confirmed.

### Specification Preview
* Outcome / task title
* Deliverables and accepted formats
* Acceptance criteria, written as observable checks
* Verification method and what counts as evidence
* Deadline or schedule
* Maximum budget and currency
* Constraints, exclusions, and dependencies
* Known assumptions and unresolved questions

---

## 7. Contract and Authority Review
The contract review is one of the most important screens in WorkPay. It must be understandable without reading internal technical documentation.

* Show scope, deliverables, acceptance criteria, deadline, price, currency, provider, revision conditions, and payment conditions in a clear hierarchy.
* Make the spending ceiling and any delegated authority explicit. Explain what the agent may do without asking again and which actions require renewed approval.
* Show material assumptions and exclusions, not just the polished summary.
* Use an explicit confirmation action for binding commitments. The action label should describe the consequence, e.g. “Approve task and authorize payment step,” only if that is the real action.
* Record the approved contract/specification version and actor. Changes to material terms must create a new version and obtain required acceptance before becoming effective.

Never present a vague “Continue” button as the only signal that the user is committing funds or approving contract terms.

---

## 8. Provider Recommendation and Negotiation Visibility
* Present a recommended provider with a concise rationale grounded in relevant capabilities, price, timing, and task constraints.
* Distinguish verified facts from estimates, generated summaries, and unverified claims.
* Show the proposed offer and material negotiation changes before a commitment is made.
* Make it clear when the system is still exploring options versus when an offer has been accepted or a contract is binding.
* Do not invent provider ratings, testimonials, completion statistics, or guarantees.

---

## 9. Canonical Task Detail
The Task detail screen is the single source of user-facing truth for a task. All other views should link back to it.

* **Header:** outcome title, stable task identifier, current state, and the one most relevant next action.
* **Summary:** objective, owner, provider, agreed price/currency, deadline, and important constraints.
* **Specification/Contract:** approved version, deliverables, acceptance criteria, payment conditions, and change history.
* **Execution:** human-readable milestones and current blocker, if any.
* **Deliverables & Verification:** files, submission version, criterion-by-criterion result, evidence links, verifier explanation, and revision history.
* **Payment:** PayPal-related state, relevant transaction/reference identifiers where safe, last confirmed event, and any pending/failed/uncertain state.
* **Activity/Evidence:** append-only, timestamped events showing key decisions, approvals, submissions, verification runs, and payment events.

Keep the timeline readable. Internal event payloads and stack traces belong in protected diagnostics, not the ordinary user interface.

---

## 10. Task Lifecycle and State Presentation
The UI must use backend-authoritative task states and transitions. Do not invent a separate frontend state machine that can drift from the domain model.

* Intent captured / clarification needed
* Specification proposed / awaiting user review
* Provider discovery or negotiation in progress
* Contract awaiting approval
* Awaiting required payment authorization or funding confirmation
* Execution in progress
* Deliverable submitted
* Verification in progress
* Verification failed — revision path available where policy permits
* Verification uncertain — human review or defined exception path
* Verified / eligible for the next settlement step
* Payment processing
* Payment confirmed
* Completed
* Blocked, cancelled, expired, or disputed where those states are explicitly supported

These labels are illustrative presentation language. Map them to the actual state machine documented in the architecture; do not add states merely because they seem useful. Keep dispute, cancellation, and exceptional payment states from destructively overwriting the task's history.

---

## 11. Deliverables, Verification, and Revisions
* Present verification at the level of individual acceptance criteria, not only a green “passed” badge.
* For each criterion, show status (pass/fail/uncertain), short explanation, and the evidence supporting the result.
* Distinguish missing evidence from evidence that demonstrates failure.
* A failed verification should explain what needs to change and link to the relevant criterion. Offer revision only when the contract and policy permit it.
* A revision submission must be versioned. Preserve prior submissions and verification results.
* An uncertain result must not be silently treated as a pass. Provide the supported human-review or exception path.

Avoid implying that automated verification is infallible; make the verification method and confidence/limitations understandable where relevant.

---

## 12. PayPal Payment and Escrow Experience — Critical
WorkPay does not need a wallet. PayPal is the payment provider and the relevant PayPal escrow/payment arrangement is external to WorkPay. The UI should reflect the exact integration and confirmed provider state.

* No wallet balance, wallet funding, cash-out, internal transfer, or stored-value feature.
* No UI language suggesting WorkPay itself holds user funds.
* Show only payment/escrow states that the actual PayPal integration and backend can authoritatively establish.
* Separate payment authorization, funding/escrow confirmation, eligibility for capture/release, processing, confirmed capture/release, failure, and unknown/reconciliation-needed states when applicable to the integration.
* Task approval or verification must not be presented as proof that PayPal capture or release has succeeded.
* Payment actions must be idempotent and driven by backend policy. The frontend must never be the authority that decides a payment can proceed.
* For webhook delays or uncertain outcomes, show a pending/reconciling state and refresh from authoritative server state; do not encourage blind retries.
* Use the PayPal-supported flow and terminology accurately. Do not assume that a particular PayPal product supports escrow, delayed capture, or release semantics unless the configured integration and architecture confirm it.
* Show safe transaction references and timestamps where useful. Do not expose secrets, full payment credentials, or unnecessary personal financial data.

---

## 13. Activity, Audit, and Notifications
* Record important actions with actor, timestamp, task reference, contract/specification version where relevant, and outcome.
* Important events include specification approval, contract acceptance, provider/offer changes, submission, verification, revision request, human override, payment state changes, and cancellation/dispute decisions where supported.
* Show human-readable event names and meaningful context in the product. Keep raw payloads in secured operational tooling.
* Notifications should deep-link to the task and the exact action needed.
* Avoid duplicate notifications for webhook retries or idempotent repeated events.
* Do not make an event disappear because a later state supersedes it.

---

## 14. Visual Design Direction
Use a premium, calm, precise product aesthetic. It should feel like a trustworthy execution workspace rather than a crypto dashboard, gig marketplace, or flashy AI demo.

* **Canvas:** warm off-white or very light neutral surfaces; dark charcoal text; restrained amber as the primary accent.
* **Typography:** highly legible sans-serif with strong hierarchy, generous whitespace, and concise labels.
* **Layout:** desktop-first for the MVP, with a robust responsive layout for tablet and mobile.
* **Cards:** restrained borders and subtle surface contrast; avoid excessive shadows, gradients, and nested card overload.
* **Status:** use text labels and icons alongside color. Color must not be the only way a state is communicated.
* **Primary action:** one clear primary action per screen/section; secondary actions should remain visually subordinate.
* **Motion:** brief and purposeful. Never use animation to obscure asynchronous state or imply success prematurely.
* **Data density:** show enough detail for decisions without exposing internal service complexity.

### Suggested Palette
* Charcoal: `#222326`
* Warm Background: `#F7F5F0`
* White Surface: `#FFFFFF`
* Muted Text: `#6B6F76`
* Amber: `#B77A2B`
* Green for confirmed success
* Blue for active/informational state
* Red for failure/destructive actions

*Treat these as tokens to tune against the existing application, not a mandate to rewrite its design system.*

---

## 15. Interaction and Accessibility Requirements
* Every consequential action has an understandable label and a confirmation step where appropriate.
* Use accessible labels, keyboard navigation, visible focus, semantic headings, and appropriate contrast.
* Do not communicate state only by color, animation, or icon.
* Forms preserve user input after recoverable failures.
* Long-running AI, verification, and payment operations have clear pending, success, failure, and retry/reconciliation states.
* Disable duplicate submission only as a usability aid; server-side idempotency remains mandatory.
* Responsive layouts must preserve task state, primary actions, contract terms, and verification evidence.

---

## 16. Error, Pending, and Exceptional States
* **AI cannot interpret request:** ask a clarifying question; do not fabricate a specification.
* **Provider unavailable:** explain the state and supported next options without claiming a commitment exists.
* **Contract changed:** show what changed and require the relevant acceptance before continuing.
* **Upload failed:** identify the affected file and allow safe retry.
* **Verification service unavailable:** show verification as pending/failed-to-run, not as a failed deliverable or pass.
* **Payment provider timeout:** show state as unknown/reconciling until checked against authoritative provider/server state.
* **Webhook duplicated or delayed:** remain consistent and idempotent; do not create duplicate captures or activity entries.
* **Dispute/cancellation:** preserve prior work, evidence, and payment history; explain what is paused and which actions remain available.

--- ## 17. Security and Trust Boundaries
* Authorization is enforced server-side on every task, submission, contract, file, and payment operation.
* A UI permission check is for presentation only and cannot replace server authorization.
* Task and contract versions are immutable after acceptance; material changes create a new version.
* Files use authenticated, time-limited access or another approved secure delivery mechanism; never expose predictable public file URLs.
* Verify PayPal webhooks using the provider's supported verification method and reconcile payment state from authoritative records.
* Use idempotency keys for economic actions and durable records for external operation attempts.
* Human overrides are permissioned and audited.
* The agent cannot exceed budget, scope, or action permissions granted by the user and enforced by policy.
* Never place secrets, access tokens, or sensitive provider payloads in browser-visible logs or user-facing activity.

---

## 18. Implementation Boundaries
* The UI must reflect the architecture rather than replacing it with client-side business logic.
* Use the backend domain model and state machine as the source of truth.
* Represent long-running orchestration as explicit asynchronous states and poll/subscribe through supported application APIs.
* Keep task, specification/contract version, submission, verification result, payment operation, and audit event as distinct domain records where the architecture defines them.
* Keep PayPal integration isolated behind the approved payment service/integration layer.
* Never fabricate successful AI planning, provider acceptance, verification, escrow/funding, capture, or release responses to make a demo look complete.
* Use realistic seeded data only where the architecture explicitly permits it, and visibly distinguish demo data from real execution.

---

## 19. MVP Scope Discipline
* The MVP should demonstrate the end-to-end dataset-cleaning workflow defined in the engineering plan, including a failed first verification, a successful revision, and payment capture only after policy permits it.
* Prioritize one complete, reliable, observable workflow over many shallow features.
* The failed first verification and successful revision should be real states generated by the verification workflow, not hard-coded decorative UI.
* PayPal capture must follow the configured integration, policy decision, and authoritative backend state.
* Do not expand into a full marketplace, generalized wallet, broad provider social profiles, or unrelated dashboards unless the governing architecture explicitly includes them.
* Keep all screens necessary to understand, approve, execute, verify, and settle the core task coherent and testable.

---

## 20. Definition of Done for the Product Experience
* A user can describe a task and understand the AI's interpretation before committing.
* The specification, acceptance criteria, budget ceiling, and contract terms are reviewable and versioned.
* The user can distinguish recommendation, proposal, approved commitment, active execution, submitted work, verification result, and settlement state.
* The task detail provides a canonical and auditable history.
* A failed verification leads to an actionable revision path where supported; a successful revision is independently verified.
* Uncertain verification and uncertain payment states are not silently converted into success.
* No wallet feature is present.
* No payment success is displayed without authoritative confirmation.
* Server-side authorization, idempotency, secure file access, and auditability are preserved.
* The desktop workflow is polished and responsive layouts remain usable.
* The implementation aligns with the actual architecture and engineering plan rather than inventing product scope.

---

## 21. Instructions to the Coding Agent
* Treat this specification as a product-experience companion to the supplied architecture and engineering documents. The architecture, state machine, security requirements, and master build prompt remain authoritative if wording differs.
* Read the supplied overview, master build prompt, engineering plan, engineering quality constitution, and relevant component specifications before implementation.
* Inspect the existing repository and current implementation before changing files. Reuse existing patterns and design tokens when sound.
* Map every UI state and action to a real backend contract and authorized domain transition.
* Do not introduce a WorkPay wallet or represent WorkPay as the custodian of funds.
* Do not invent PayPal capabilities. Verify the configured PayPal product and integration contract before implementing payment language or controls.
* Build the narrow MVP workflow end to end, including failure, revision, verification, and settlement edge cases.
* Keep consequential actions explicit, auditable, idempotent, and permissioned.
* When documentation leaves a business policy unresolved, do not invent a policy silently. Record the gap and implement a safe blocked/needs-decision state where necessary.
* Before completion, test permissions, stale contract versions, duplicate submissions, duplicate/delayed webhooks, provider timeouts, verification uncertainty, and recoverable errors.

---

## 22. Source Alignment Note
This document is derived from the supplied architecture archive, including `overview.md`, `build_prompt.md`, `ENGINEERING_PLAN.md`, `engineering_quality_constitution.md`, and the component specifications. It corrects the earlier generic UI interpretation, particularly the mistaken wallet concept, and centers the experience on task orchestration, user-authorized commitments, evidence-based verification, and PayPal-based settlement.

*Important: PayPal's exact supported payment/escrow semantics must be confirmed against the configured product and integration. This specification describes the user experience and trust boundaries, not an unsupported claim that every PayPal product provides escrow or delayed-release functionality.*
