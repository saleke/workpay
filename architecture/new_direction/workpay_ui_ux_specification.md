# WorkPay: Product UI/UX and Frontend Implementation Brief

## 1. Your Mission

Act as a world-class product designer, senior frontend engineer, and product-minded software architect.

Your task is to transform WorkPay into a polished, trustworthy, production-quality AI-powered economic execution system. Do not treat this as a generic SaaS dashboard, freelance marketplace, chatbot, or payment application.

**The core product promise is: Commit → Execute → Prove → Settle. Money follows proof.**

Users describe an outcome. WorkPay helps clarify the requirements, produce a structured specification and agreement, coordinate execution, evaluate deliverables against acceptance criteria, and facilitate settlement when the applicable policies and confirmed payment state permit it.

The interface must make this entire process understandable, transparent, and recoverable when something goes wrong.

You are responsible for designing and implementing the complete user experience, including information architecture, visual design, interaction behavior, responsive layouts, frontend architecture, accessibility, error handling, and integration with the existing backend.

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

Do not assume that this brief replaces the existing architecture or engineering constitution. The existing architecture is authoritative for technical capabilities and business rules. Where a conflict exists, document it and explain the recommended resolution before making a foundational change.

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

## 6. Build the Task Workspace First

The task workspace is the most important product screen.

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

## 7. Implement the Complete Task Journey

Use the architecture's actual state machine. The following describes the intended user experience, not a replacement backend state machine.

### Stage A: Task creation

Allow users to describe their desired outcome in natural language.

Provide:
- A focused input.
- Supported file attachments.
- Relevant contextual fields.
- Validation.
- Clear next steps.
- Draft preservation where feasible.

Avoid overwhelming new users with technical configuration before it is needed.

### Stage B: AI clarification

The AI should ask specific questions when missing information materially affects scope, deliverables, acceptance criteria, cost, permissions, or execution.

Keep the user's original intent and clarification history understandable.

Distinguish drafts and recommendations from binding commitments.

### Stage C: Structured specification

Present the proposed specification in readable, editable sections where supported:

- Desired outcome.
- Inputs.
- Deliverables.
- Acceptance criteria.
- Constraints and exclusions.
- Assumptions.
- Unresolved questions.

Clearly identify unresolved matters and allow appropriate corrections.

Do not turn an unconfirmed assumption into an agreed requirement without the required approval.

### Stage D: Agreement review

Provide a dedicated agreement review experience.

Show:
- Scope.
- Deliverables.
- Acceptance criteria.
- Constraints.
- Applicable revision terms, if defined.
- Provider identity.
- Agreed price and currency.
- Payment arrangement.
- Relevant authorization and funding states.
- The consequences of the action being requested.

The user must be able to understand the work agreement and financial consequences before confirming.

Use precise action labels, such as “Approve agreement” or “Approve agreement and authorize payment,” only when they accurately describe the underlying operation.

Preserve agreement versions and approval history as required by the architecture.

### Stage E: Execution

Show real execution status and meaningful activity.

Communicate:
- What has actually happened.
- What is happening now, if known.
- What is waiting.
- What is blocked.
- Whether user input is required.
- What the next supported step is.

Do not invent progress percentages or milestones.

Distinguish AI activity from provider activity where the underlying events allow it.

### Stage F: Submission and verification

Present the actual submitted deliverables and the verification results supported by the backend.

Where available, each acceptance criterion should show:

- The agreed requirement.
- The result.
- The supporting evidence or explanation.
- Relevant limitations or uncertainty.
- The resulting workflow consequence.

Distinguish the submitted deliverable, observed evidence, verification conclusion, and workflow decision.

Do not invent criterion-level evidence if the verification system does not provide it.

### Stage G: Failed verification and revision

A failed verification must be understandable and actionable.

Show the specific unmet requirements, the evidence supporting the result, and the next legitimate step.

Preserve previous submissions, results, and relevant agreement versions.

If comparison between submissions is supported, make it easy to inspect what changed.

Do not silently overwrite previous evidence or present an uncertain verification as a definite failure or success.

### Stage H: Settlement

Settlement must only be offered when the authoritative backend policy and payment state permit it.

Show:
- Agreed amount and currency.
- Actual payment state.
- Relevant conditions.
- What the next payment action will do.
- Whether user action is required.
- The confirmed result of the operation.

Never claim payment has succeeded merely because a request was submitted.

### Stage I: Completion

Show completion only when the authoritative task lifecycle permits it.

Summarize the actual outcome, relevant deliverables, verification result, and confirmed economic state.

Do not invent guarantees about future disputes, refunds, or financial protection.

## 8. Payment UX and PayPal Safety

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

## 16. Required End-to-End MVP

Use the architecture's supported dataset-cleaning workflow to validate the complete journey.

Demonstrate:

1. User describes the desired outcome.
2. AI requests necessary clarification.
3. Structured specification is generated.
4. User reviews the specification and agreement.
5. Applicable authorization and payment operations are performed.
6. Execution progresses through real supported states.
7. A deliverable is submitted.
8. Verification fails for a concrete, supported reason.
9. The revision process is followed.
10. A revised deliverable is submitted.
11. Verification succeeds.
12. Settlement becomes available only when the authoritative conditions permit it.
13. The payment outcome is accurately reconciled and displayed.
14. The task reaches completion only when the backend permits it.

Use real backend integration where available. Use fixtures or mocks only according to the existing testing conventions. Never hardcode fake success states into production behavior.

## 17. Implementation Sequence

Implement in small, verifiable stages.

**Stage 1 — Audit and plan**
Inspect the repository, document the architecture, identify missing pieces, and map the journey to existing APIs and state transitions.

**Stage 2 — Design system and shell**
Reconcile design tokens, reusable components, navigation, responsive behavior, and accessible primitives.

**Stage 3 — Task creation and specification**
Implement the outcome input, clarification flow, draft behavior, and structured specification.

**Stage 4 — Agreement and authorization**
Implement contract review, commercial terms, explicit approval, and accurate payment-state presentation.

**Stage 5 — Execution and submission**
Implement task status, activity, deliverables, file access, and permission-aware actions.

**Stage 6 — Verification and revision**
Implement evidence presentation, failure states, revision, resubmission, and relevant history.

**Stage 7 — Settlement and completion**
Implement authoritative settlement eligibility, safe payment actions, reconciliation, and confirmed completion.

**Stage 8 — Quality and resilience**
Complete responsive behavior, accessibility, exceptional states, and end-to-end testing.

Do not skip ahead to decorative polish while the primary workflow remains incomplete.

## 18. Definition of Done

The implementation is complete only when:

- The core journey works end to end.
- Failed verification and successful revision are both demonstrated.
- Payment states match authoritative backend and provider outcomes.
- No unsupported wallet, escrow, or payment behavior has been introduced.
- Task state and permissions are not independently reimplemented in the frontend.
- All consequential actions are explicit and recoverable.
- Relevant loading, empty, error, pending, and uncertain states exist.
- Agreement, submission, and verification history are preserved as required.
- Desktop and mobile experiences are usable.
- Keyboard and assistive-technology behavior has been tested.
- The repository's engineering quality checks pass.
- Relevant integration and end-to-end tests pass.
- No important control is decorative or disconnected from actual functionality.
- No unsupported business rule has been invented.

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

