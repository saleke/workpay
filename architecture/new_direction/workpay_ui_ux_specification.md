# WorkPay: Task-Intake UI/UX and Frontend Implementation Brief

## 1. Your Mission

Act as a world-class product designer, senior frontend engineer, and product-minded software architect for the current task-intake phase.

Your task is to make WorkPay's current task-intake experience trustworthy, accessible, and production-quality. Do not treat it as a generic SaaS dashboard or chatbot.

**The current product promise is: Explain → Confirm → Clarify → Approve a brief.**

Users describe an outcome. WorkPay helps them confirm what they mean, establish only the core requirements and budget state, and approve an exact brief before any professional is approached. Candidate discovery and user-approved contact come later. Execution, agreements, payment, and completion review are separate future phases.

The interface must make this intake process understandable, transparent, and recoverable when something goes wrong.

You are responsible for designing and implementing the intake experience, including information architecture, visual design, interaction behavior, responsive layouts, frontend architecture, accessibility, error handling, and integration with the existing backend.

Do not simply produce attractive screens. Build a coherent, working product.

## 2. Mandatory Repository Inspection

Before modifying code, inspect the existing repository and read the relevant documentation, including:

- `overview.md`
- `build_prompt.md`
- `ENGINEERING_PLAN.md`
- `engineering_quality_constitution.md`
- All relevant component specifications, including `components/componet-19.md` if it exists at that path.
- Existing frontend code, routes, components, styles, API clients, authentication logic, and tests.
- Existing backend contracts, task lifecycle definitions, permission rules, and PayPal integration.

Use the actual repository structure to determine which files and components are relevant.

The current product scope and phase gates in `ENGINEERING_PLAN.md` §§1-2 and 7 are authoritative. Older architecture and journey specifications remain useful technical references only where they do not conflict with the approved direction. Do not implement candidate outreach, negotiation, payment, execution, or completion review as part of intake.

Before implementation, produce a concise audit covering:

1. Existing frontend architecture and technology stack.
2. Current routes and major screens.
3. Existing design system and reusable components.
4. Actual task lifecycle and backend state machine.
5. Existing buyer and provider permissions.
6. Supported PayPal operations and their authoritative states.
7. Missing, incomplete, or inconsistent UI/UX.
8. The implementation sequence you recommend.

Do not stop after the audit. Proceed with implementation in small, verifiable stages unless a genuine architectural ambiguity or consequential business decision requires human approval.

## 3. Product Principles

These principles are mandatory.

### 3.1 The task is the center of the product

The task is the canonical record of:

- User intent.
- Inputs and relevant files.
- Structured specification.
- Agreement and its version.
- Provider assignment.
- Execution status.
- Deliverables and submissions.
- Verification criteria, evidence, and results.
- Payment state.
- Activity and audit history.
- Available actions and required decisions.

The UI must present these elements as parts of one coherent workflow, not as disconnected features.

### 3.2 Distinguish five important concepts

Throughout the interface, distinguish between:

1. **Proposed:** The AI has suggested an action or outcome.
2. **Authorized:** The appropriate person or policy has granted permission.
3. **Executed:** The action has actually occurred.
4. **Verified:** The relevant evidence has been evaluated against the agreed criteria.
5. **Confirmed:** The authoritative system has confirmed the resulting state.

Never represent one of these states as another.

An AI proposal is not an executed action. A submitted deliverable is not automatically an accepted deliverable. A payment request is not a confirmed payment.

### 3.3 Keep consequential decisions explicit

Users must understand what they are approving, what authority they are granting, what financial consequences may follow, and what conditions remain outstanding.

Do not silently commit users to contractual terms, external actions, or financial operations.

### 3.4 Make failures recoverable

A failed request, rejected deliverable, unavailable integration, or uncertain payment must not leave the user stranded.

Explain what happened, what is known, what remains uncertain, and which recovery actions are actually supported.

### 3.5 Respect the existing business model

- Do not introduce a WorkPay wallet.
- Do not invent PayPal capabilities.
- Do not describe a payment arrangement as escrow unless the configured integration actually supports that arrangement.
- Do not invent cancellation, refund, dispute, revision, deadline, or approval policies.
- Do not fabricate execution progress, verification evidence, transaction history, or success messages.
- Do not add features merely to make the dashboard look complete.

When a required policy or integration detail is missing, identify the dependency and request clarification rather than inventing behavior.

## 4. Design Direction

Create a premium, calm, precise, operational interface.

WorkPay should feel like a workspace designed for coordinating real work and consequential decisions.

Avoid the visual language of generic admin templates, gig marketplaces, crypto dashboards, and AI chat wrappers.

### Visual characteristics

- Restrained and consistent visual hierarchy.
- Generous whitespace where it improves comprehension.
- Efficient information density for operational screens.
- Clear typography and readable financial information.
- Fine, subtle borders.
- Minimal, purposeful shadows.
- Consistent corner radii.
- Restrained use of color.
- Short, purposeful animations.
- Excellent empty, loading, error, and pending states.

Use Linear as inspiration for navigation and interaction efficiency, Attio for structured information, Vercel for operational visibility, and Stripe or Mercury for financial clarity. Learn from these products without copying their interfaces or business models.

### Initial design-token direction

Reconcile these suggestions with the repository's existing design system before implementing them.

```css
:root {
  --wp-canvas: #F7F5F0;
  --wp-surface: #FFFFFF;
  --wp-surface-subtle: #F2F1ED;

  --wp-text-primary: #232323;
  --wp-text-secondary: #6B6F76;
  --wp-text-muted: #8B8D91;

  --wp-border: #E7E5DF;
  --wp-border-strong: #D6D3CC;

  --wp-accent: #B7792D;
  --wp-accent-subtle: #F7EBDD;

  --wp-success: #287A53;
  --wp-success-subtle: #EAF5EE;

  --wp-info: #315FA8;
  --wp-info-subtle: #EDF3FC;

  --wp-warning: #99631B;
  --wp-warning-subtle: #FBF2DF;

  --wp-danger: #B33A36;
  --wp-danger-subtle: #FBECEB;

  --wp-radius-sm: 6px;
  --wp-radius-md: 10px;
  --wp-radius-lg: 14px;
  --wp-radius-xl: 18px;
}
```

Establish consistent typography, spacing, focus, elevation, border, and motion tokens as appropriate to the existing stack.

Use semantic design tokens rather than scattering arbitrary color values throughout components.

Status colors must always be accompanied by understandable text labels.

## 5. Information Architecture

Use the existing routes where appropriate. Do not create duplicate navigation structures if the application already has a suitable architecture.

For the current phase, prioritize task intake, recoverable drafts, interpretation correction, essential clarification, budget confirmation, and approved briefs. A task list or activity view must not imply that candidate discovery, contact, negotiation, execution, or payment is available during intake; show only authoritative states and real events.

The recommended structure is:

**Workspace**
- Home
- Tasks
- Activity

**Account**
- Settings
- Help or support, if supported

Provide a prominent **New task** action.

A separate payment view may be introduced only if it serves a genuine user need and reflects actual payment records. It must not imply the existence of a WorkPay wallet.

### Home

Prioritize:

1. Items requiring the current user's attention.
2. Active tasks.
3. Important recent activity.
4. A clear task-creation entry point.

Do not prioritize meaningless metrics, fake graphs, empty financial summaries, or decorative progress indicators.

### Tasks

Provide a searchable, scannable task list with useful filters corresponding to real lifecycle states or meaningful derived groupings.

Useful attributes may include:

- Task name.
- Current status.
- Provider, when assigned.
- Agreed amount, where appropriate.
- Last meaningful activity.
- Whether the current user needs to act.

Support useful empty states, URL-persisted filters where appropriate, browser Back behavior, and responsive layouts.

### Activity

Show meaningful, real events such as agreement approvals, submissions, verification results, revisions, and confirmed payment events.

Distinguish user actions, provider actions, AI proposals, AI-executed actions, verification events, payment-provider events, and system events where this distinction is available.

Do not fabricate activity.

## 6. Future Task Workspace Reference

The full task workspace described below belongs to later phases. Do not implement provider, agreement, execution, verification, or payment surfaces as part of the current intake phase. Revisit these patterns only after their scope and workflows receive separate approval.

The task workspace will be an important product screen in those later phases.

It must give users a clear understanding of the task's current state, agreement, execution, deliverables, evidence, payment status, and next action.

### Workspace structure

Use a responsive layout containing:

**Header**
- Breadcrumbs.
- Task title.
- Current status.
- Concise status explanation.
- Primary next action when one is legitimately available.
- Secondary actions permitted by the current user's permissions.

**Main content**
- Task information appropriate to the current lifecycle state.
- Specification and agreement.
- Execution details.
- Deliverables and submissions.
- Verification results and evidence.
- Revision information.
- Relevant activity.

**Supporting information**
- Provider information.
- Agreement version.
- Agreed amount and currency.
- Relevant dates.
- Actual payment status.
- Recent meaningful events.

Use tabs or secondary navigation where they improve clarity. Avoid hiding essential information behind unnecessary navigation.

The screen must adapt to the task state rather than rendering every task identically.

For example:

- A draft task emphasizes requirements and clarification.
- A task awaiting approval emphasizes the agreement and commitment.
- An executing task emphasizes real activity and blockers.
- A task awaiting verification emphasizes the submitted deliverables.
- A failed verification emphasizes unmet criteria and revision actions.
- A task awaiting settlement emphasizes the applicable conditions and authoritative payment state.
- An uncertain payment emphasizes the unresolved outcome and safe recovery path.

Only expose actions supported by the backend and permitted for the current user.

## 7. Implement the Intake Journey

Use the following stages as the current product scope. They describe the intended user experience, not a replacement backend state machine.

### Stage A: Capture the request

Let the user describe the work and desired outcome in natural language. Preserve the original wording and make draft recovery clear. Do not front-load technical configuration or secondary preferences.

### Stage B: Interpret and confirm intent

Show a concise, editable, source-grounded interpretation, including what is known, what is uncertain, and what the system may have misunderstood. AI-generated statements are proposals, not binding requirements. The user must be able to correct the interpretation and confirm it; material edits must be re-evaluated and confirmed in context.

### Stage C: Clarify only essential requirements

Ask at most the highest-value task-critical question at a time, and explain why it matters. Do not ask for secondary details such as color, brand, or implementation choices by default. Keep unanswered or conflicting material questions visible without pretending the task is ready.

### Stage D: Establish budget meaning

Let the user state or confirm a ceiling, target, range, unclear/conflicting state, or explicitly undecided state. An undecided budget is valid and carries no estimated price or funding assumption. Never imply that an AI estimate is the user's budget, a quote, or an agreement. Preserve the user's currency; do not silently convert it.

### Stage E: Review and approve the brief

Present a readable, editable summary of the outcome, confirmed requirements, constraints, unknowns, and budget state. Distinguish user-provided facts from AI proposals and confirmed decisions. The user approves an exact version; show what approval means and preserve a way to recover from errors. Only information explicitly stated, clarified, or approved may become binding.

Candidate discovery, professional selection and outreach, agreements, execution, verification, settlement, and completion are outside this journey. Brief approval must not trigger any of them.

## 8. Financial Actions Are Out of Scope for Intake

The intake UI must not authorize, capture, or otherwise initiate payment. It must not present a budget, estimate, or approved brief as an agreed price or payment commitment. Any future financial interaction must use authoritative backend state and a separately approved design.

Treat financial operations as high-consequence interactions.

Use the actual payment state model returned by the backend and configured PayPal integration.

Possible states may include authorization required, authorization confirmed, processing, settlement eligible, settlement processing, settlement confirmed, failed, or uncertain. These are examples, not a requirement to invent unsupported states.

The frontend must not independently determine whether money has moved.

### Uncertain payment outcome

If a payment request times out or its outcome cannot be confirmed:

- Preserve the user's context.
- Display an explicit unresolved status.
- Do not report success or failure without evidence.
- Do not immediately invite a duplicate payment attempt.
- Follow the backend's reconciliation process.
- Offer a retry only when the authoritative system determines it is safe.

The backend remains responsible for payment reconciliation, idempotency, webhook verification, and economic state transitions.

The frontend must accurately communicate those states.

## 9. AI Transparency and User Control

Separate AI behavior into understandable stages:

- Proposed.
- Awaiting review.
- Authorized.
- Executing.
- Completed.
- Failed or unresolved.

Explain what the AI is doing when that information is available and useful.

Do not expose raw internal reasoning or overwhelm users with implementation details.

Where supported by the backend, users should be able to correct assumptions, reject proposals, review changes, pause or stop operations, and inspect relevant actions.

Do not render a control unless its behavior is implemented and enforced.

## 10. Component System

Build reusable components around consistent semantics, behavior, and accessibility.

Potential component groups include:

**Foundation**
- Typography.
- Color and spacing tokens.
- Surface and border primitives.
- Focus indicators.
- Icons.
- Motion.

**Application shell**
- Sidebar.
- Top bar.
- Breadcrumbs.
- Page headers.
- Responsive navigation.

**Data presentation**
- Task row.
- Status badge.
- Activity item.
- Timeline event.
- Metadata row.
- Empty state.
- Skeleton.
- Error panel.

**Workflow**
- Outcome input.
- Clarification panel.
- Specification section.
- Acceptance criterion.
- Agreement review.
- Approval summary.
- Deliverable list.
- Verification result.
- Revision comparison.
- Confirmation dialog.
- Recovery panel.

**Financial**
- Agreed amount.
- Payment status.
- Payment event.
- Settlement conditions.
- Pending-payment panel.
- Uncertain-payment panel.
- Supported payment action.

Use the project's existing component library where appropriate. Do not introduce redundant dependencies without justification.

A component is complete only when its relevant loading, disabled, error, focus, responsive, and accessibility behavior is defined.

## 11. Frontend Engineering Requirements

### Authoritative state

Use backend responses as the source of truth for task state, agreement status, permissions, verification results, and payment state.

Derived UI groupings must be explicit, testable, and consistent with backend policy.

Do not maintain a competing client-side lifecycle state machine.

### Action lifecycle

For important actions:

1. Validate required input.
2. Send the supported request.
3. Display a clear pending state.
4. Reconcile with the authoritative response.
5. Show confirmed success, a specific failure, or an unresolved outcome.
6. Preserve the user's context and provide a safe next step.

Avoid optimistic UI that prematurely claims a consequential action succeeded.

### Permissions

Show only actions available to the current user and task state.

The backend must enforce authorization regardless of what the frontend displays.

Handle stale permissions and inaccessible deep links gracefully.

### URL state

Where appropriate, support direct links and browser navigation for task routes, active tabs, filters, search, and pagination.

Do not place secrets or sensitive payment information in URLs.

### Forms and asynchronous behavior

- Preserve user input after recoverable failures.
- Prevent accidental duplicate submissions.
- Use backend idempotency for consequential operations where required.
- Distinguish request submission from confirmed completion.
- Provide actionable validation messages.
- Handle stale data and partial loading gracefully.

## 12. Responsive Design

Design intentionally for desktop, tablet, and mobile.

Desktop should support efficient navigation, rich task workspaces, detailed verification, and side-by-side review where appropriate.

Tablet should adapt secondary panels and dense content.

Mobile should prioritize task identity, status, evidence, and the next action. Stack complex review sections rather than compressing them into unreadable columns.

Ensure:
- No horizontal overflow.
- Comfortable touch targets.
- No hover-only functionality.
- Forms remain usable with virtual keyboards.
- Sticky actions do not obscure content.
- Financial consequences remain visible before confirmation.
- Browser zoom and safe areas are respected.

## 13. Accessibility

Implement and test:

- Semantic HTML.
- Logical heading hierarchy.
- Keyboard navigation.
- Visible focus.
- Accessible names for icon-only controls.
- Properly labeled form fields.
- Accessible dialogs and focus restoration.
- Clear validation errors.
- Screen-reader announcements for meaningful asynchronous changes.
- Text labels for statuses.
- Sufficient contrast.
- Reduced-motion support.
- Browser zoom.
- Appropriate focus movement after validation failures.

Accessibility must be built into the components and workflow rather than added as a final cosmetic pass.

## 14. Required UI States

Design and implement relevant states for every major screen:

- Initial loading.
- Empty data.
- Populated data.
- Submitting.
- Confirmed success.
- Validation error.
- Network failure.
- Permission denied.
- Stale data.
- Pending operation.
- Unknown outcome.
- Partial data availability.
- Conflict.
- Cancellation, where supported.
- Unavailable integration.
- Verification failure.
- Revision required.
- Payment uncertainty.

Every error or blocked state should explain what is known, what the user can do next, and what the system will handle automatically.

Do not use generic error banners when a specific explanation and recovery path are available.

## 15. Security and Data Integrity

- Respect backend permissions for all task data and file access.
- Do not expose private file URLs unnecessarily.
- Handle expired file links.
- Preserve agreement and verification history as required.
- Distinguish AI proposals from completed actions.
- Avoid exposing sensitive information in notifications or activity summaries.
- Do not silently modify an approved agreement.
- Do not imply that frontend checks are security boundaries.
- Never claim payment, verification, or execution succeeded without authoritative confirmation.

## 16. Required End-to-End Intake MVP

Validate the intake with representative tasks from multiple occupations, sectors, task types, language styles, and budget expressions, not a single dataset-cleaning workflow.

Demonstrate:

1. User describes a task and can return to a recoverable draft.
2. AI produces a source-grounded interpretation without inventing requirements or price.
3. User corrects or confirms the interpretation; edits are handled in context.
4. The system asks only material, task-critical questions and explains their purpose.
5. Budget meaning, including explicitly undecided, is represented accurately without inference or currency conversion.
6. User reviews and approves an exact, versioned brief.
7. Stale versions, unauthorized access, invalid model output, and service failures do not produce a false ready/approved state.
8. Intake does not invoke candidate search, contact, negotiation, acceptance, or payment.

Use real backend integration where available. Use fixtures or mocks only according to the existing testing conventions. Never hardcode fake success states into production behavior.

## 17. Intake Implementation Sequence

Follow `ENGINEERING_PLAN.md` §7: define the intent/provenance/budget model and evaluation cases; implement server-owned AI intake and versioning; implement user correction, clarification, budget confirmation, and exact-version approval; then validate quality and UX before rollout. Do not build downstream professional or payment workflows as a shortcut or dependency.

## 18. Intake Definition of Done

The intake implementation is complete only when:

- Users across representative domains can express a task and correct its interpretation.
- Original text, confirmed facts, AI proposals, unknowns, and provenance remain distinguishable.
- Only material, task-critical clarifications are asked; unsupported details are not invented.
- Budget meaning is explicit, and undecided remains valid without inferred price or funding.
- The final brief is versioned, owner-bound, and approved as an exact server-side version.
- Stale versions, unauthorized access, persistence errors, and AI failures cannot create false readiness or approval.
- Candidate discovery, contact, negotiation, agreement, and payment are not triggered by intake.
- Relevant loading, empty, error, pending, and uncertain states exist and preserve user context.
- Desktop and mobile experiences are usable; keyboard and assistive-technology behavior has been tested.
- Repository quality checks and representative evaluation cases pass, with human review of model quality and user comprehension.
- No important control is decorative or disconnected from actual functionality, and no unsupported business rule has been invented.

## 19. Reporting Requirements

After the initial audit and after each implementation stage, report:

1. What was implemented.
2. Which files were created or changed.
3. Which existing components and APIs were reused.
4. Which checks and tests were run and whether they passed.
5. What remains incomplete.
6. Any unresolved architectural or business decisions.
7. Any known limitations or risks.

Do not claim that a test passed unless it was actually run.

Do not report a feature as complete if it only has a visual mockup.

## Final Instruction

Think like a product owner, interaction designer, frontend architect, and end user simultaneously.

Prioritize clarity, trust, evidence, user control, and reliable behavior over decorative complexity.

Build the smallest complete version of WorkPay that demonstrates the entire supported economic execution journey. Make every important state understandable, every consequential action explicit, every failure recoverable, and every success truthful.

**The final experience must make it easy for users to understand what is happening, why it is happening, what evidence supports it, and what happens to their work and money next.**
