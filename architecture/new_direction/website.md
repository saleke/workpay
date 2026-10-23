## Required Website Research and Design Benchmarking

Before implementing the UI, research the following websites directly. Do not rely exclusively on memory, generic design advice, or screenshots from unrelated products.

### 1. Linear — Primary UX Reference
Website: https://linear.app/

Study:
- Application navigation and information architecture.
- Task lists and task-detail layouts.
- Typography, spacing, borders, and visual hierarchy.
- Interaction patterns and keyboard efficiency.
- Status indicators and workflow presentation.
- How complex information is presented without visual clutter.

Apply the most relevant principles to WorkPay's navigation, task list, and task workspace.

### 2. Attio — AI and Structured Information Reference
Website: https://attio.com/

Study:
- How structured records and relationships are presented.
- How AI capabilities fit into a larger application.
- Contextual actions and information hierarchy.
- How users move between overview information and detailed records.

Apply relevant patterns to WorkPay's task records, structured specifications, AI-assisted clarification, and activity history.

### 3. Vercel — Execution and Developer Experience Reference
Website: https://vercel.com/

Study:
- Deployment and execution status presentation.
- Activity timelines and operational feedback.
- Loading, failure, and recovery states.
- How the interface explains complex operations.
- How users understand whether an operation is pending, complete, or unsuccessful.

Apply relevant principles to WorkPay's execution visibility, verification workflow, and exceptional states.

### 4. Stripe — Financial UX Reference
Website: https://stripe.com/

Study:
- Financial information hierarchy.
- Transaction and payment-status presentation.
- Clear explanations of consequential actions.
- Error handling and payment-related feedback.
- How financial operations are communicated without unnecessary ambiguity.

Apply relevant principles to WorkPay's task-linked payment information and settlement experience.

**Important:** Stripe is a financial UX reference, not permission to copy its business model or invent payment capabilities.

### 5. Mercury — Financial Clarity Reference
Website: https://mercury.com/

Study:
- Calm financial presentation.
- Readable monetary values and transaction information.
- Information density and layout.
- How financial actions and their consequences are communicated.

Apply only the patterns relevant to WorkPay's actual payment integration.

### 6. Ramp — Budget and Authority Reference
Website: https://ramp.com/

Study:
- How financial authority and spending controls are communicated.
- How users understand approval requirements.
- How limits, permissions, and consequential actions are presented.

Apply relevant ideas to WorkPay's user-authorized AI actions, budgets, and commitment review, but only where these capabilities exist in the actual architecture.

### 7. Frontend Quality Guidelines
Website: https://vercel.com/design/guidelines

Study the practical guidance on:
- Accessibility.
- Keyboard navigation.
- Focus management.
- Forms and validation.
- Loading and asynchronous states.
- Responsive behavior.
- URL and browser navigation.
- Error handling.

Use these principles when implementing and auditing the frontend.

## How to Conduct the Research

For each reference website:

1. Visit the site and inspect the experience available to you.
2. Examine relevant public pages and interface examples.
3. If authenticated access is unavailable, do not pretend to have inspected authenticated screens.
4. Identify specific patterns worth adopting and explain why they suit WorkPay.
5. Identify patterns that should not be adopted because WorkPay has a different product model.
6. Translate the findings into concrete components, layouts, interactions, and implementation requirements.
7. Where useful, record the reference page or URL associated with each recommendation.

Do not copy another product's branding, exact layouts, proprietary assets, or business logic. Use the research to make informed design decisions tailored to WorkPay.

## Research Deliverable

Before major UI implementation, produce a concise design benchmark containing:

- Reference website.
- Pattern observed.
- User problem it solves.
- Proposed WorkPay application.
- Relevant existing component or screen.
- Implementation priority.

### Benchmark Analysis Table

| Reference Website | Pattern Observed | User Problem It Solves | Proposed WorkPay Application | Relevant Component / Screen | Implementation Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Linear** (https://linear.app/) | High-density sub-navigation, subtle borders, contextual keyboard focus, restrained typography | Complex operational software feels cluttered or overwhelming | Sub-navigation sidebar for settings; compact badge indicators; tactile press interactions (`active:scale-[0.98]`) | `app/(app)/settings/page.tsx`, `components/ui/button.tsx` | High (Applied) |
| **Attio** (https://attio.com/) | Attribute-rich records, multi-select tag arrays, declared vs demonstrated attributes | Users cannot express multi-faceted capabilities or see provenance | Worker capabilities with proficiency levels (1 to 5) and distinction between declared vs verified skills | `components/provider/provider-profile-manager.tsx`, `settings/page.tsx` | High (Applied) |
| **Vercel** (https://vercel.com/) | Multi-stage execution pipeline, explicit state transitions (pending, executing, failed, confirmed) | Users are unsure whether an operation is in progress, failed, or finalized | Explicit distinction between Verification (criteria pass), Settlement Eligibility (policy gate), and Payment Confirmation | `components/tasks/task-room.tsx`, `app/(app)/payments/page.tsx` | High (Applied) |
| **Stripe** (https://stripe.com/) | Clear transaction states, explicit non-custodial authorization holds vs captures, fee transparency | Consequential financial operations create anxiety or confusion | Transparent PayPal Orders v2 authorization holds vs Payments v2 captures; no false wallet claims | `app/(app)/payments/page.tsx`, `settings/page.tsx` (PayPal Rails) | High (Applied) |
| **Mercury** (https://mercury.com/) | Calm financial typography, tabular numbers, clear separation of actions from audit data | Cluttered financial tables make amounts and currencies hard to scan | JetBrains Mono for monetary values; structured settlement records; calm layout | `app/globals.css`, `app/(app)/payments/page.tsx` | Medium (Applied) |
| **Ramp** (https://ramp.com/) | Hard spending boundaries, mandatory budget ceilings, policy enforcement before execution | Autonomous systems executing uncontrolled expenditures | Invariant P1 (Budget Ceiling) and Worker Minimum Compensation rule enforced as hard constraints | `packages/shared/src/domain/providers/selection.ts`, `settings/page.tsx` | High (Applied) |
| **Vercel Design Guidelines** (https://vercel.com/design/guidelines) | Accessible focus rings, explicit confirmation modals for consequential actions, inline validation | Destructive actions triggered accidentally; weak keyboard access | Accessible confirmation dialog for demo reset; inline validation for email and rates | `components/ui/dialog.tsx`, `settings/page.tsx` | High (Applied) |

Use this benchmark to guide the actual implementation, not as a substitute for building the product.

After implementing the UI, compare the result against the relevant references and document where the WorkPay experience follows, adapts, or intentionally differs from them.