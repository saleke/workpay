---
name: workpay-ui-ux
description: Own the design, implementation, and visual review of WorkPay React interfaces. Use for new or revised screens, user flows, responsive UI, accessibility, design-system work, or implementing a Figma reference without sacrificing established UX constraints.
---

# WorkPay UI/UX design and implementation

Take responsibility for the whole user experience: understand the task, make
considered product and visual decisions, implement the working interface, and
verify it in the browser. A successful build is not proof of good UX.

## Resolve product and design authority first

Before designing or changing behavior:

1. Read `architecture/ENGINEERING_PLAN.md` §0 and the relevant current scope and
   technical-baseline sections.
2. Check `OPEN-DECISIONS.md` for product or implementation decisions that apply.
3. Read the relevant product/UX specification and component references. Inspect
   existing routes and code, but treat the current implementation as evidence,
   not proof that its UX is correct.
4. Apply the repository's documented authority order when sources disagree.
   The current user's explicit request guides the task; do not silently change a
   consequential product decision or resolve a material unresolved conflict.
   Ask a focused question when the conflict prevents a safe, useful design.

Do not treat every older brief as current policy. For example,
`architecture/new_direction/workpay_ui_ux_specification.md` contains valuable
interaction, accessibility, and responsive guidance, but its scope must be
checked against the higher-authority current plan before relying on it.

Preserve the product's established distinctions between proposals, user
decisions, executed actions, verified outcomes, and externally confirmed state.
Never invent business policies, permissions, progress, evidence, success, or
financial behavior to make a screen feel complete. Show uncertainty honestly
and offer only recovery actions the system actually supports.

## Use Figma as a reference, not an unquestionable spec

When a Figma link, frame, or screenshot is supplied:

1. Inspect the relevant frame and its variants, shared components, variables,
   content, and intended flow. Use Figma MCP when it is available; request a
   frame link or screenshot if the design cannot be inspected. Never claim to
   have inspected a Figma file if you only saw its URL or a description.
2. Identify what the reference is trying to communicate: hierarchy, brand,
   interaction intent, content grouping, and visual language.
3. Check those choices against the current product rules, actual data and
   backend behavior, accessibility, responsive requirements, and the user's
   established workflow.
4. Keep compatible design intent. Adapt or omit details that would create a
   usability, accessibility, responsive, or product-truth problem. Do not force
   pixel-perfect matching when it conflicts with those requirements.
5. Explain material deviations and why they improve or protect the experience.
   Ask before changing product behavior when the right behavior is not clear.

Figma frames are design evidence, not authorization to add unsupported
features. Avoid any design-to-code workflow that requires blind visual
matching; inspect its instructions and use it only if its behavior is
compatible with this priority order.

## Design and build the complete experience

Before coding, establish:

- The user's primary goal and the next meaningful action.
- The route and flow this change belongs to, including entry and exit paths.
- Which content is authoritative, proposed, editable, or unresolved.
- Relevant loading, empty, populated, validation, disabled, permission, pending,
  failure, success, stale, and uncertain states.
- The expected behavior on narrow mobile, tablet, and desktop layouts.
- The existing React components, shadcn/Radix primitives, WorkPay tokens,
  typography, API contracts, and tests that should be reused or refined.

Make design choices deliberately. Prioritize a clear hierarchy, legible
content, meaningful feedback, and low-friction completion of the user's task.
Aim for WorkPay's calm, precise, operational character; do not default to a
generic admin template, excessive cards, decorative metrics, competing accents,
or effects without a product purpose.

Use the existing design system as a coherent starting point, not a reason to
preserve a weak screen unchanged. Improve or extend components where needed.
Prefer semantic tokens and existing project conventions. Do not add a competing
component suite, design system, or dependency without a concrete need and
justification.

Implement real behavior, not a static mockup. Keep server state authoritative,
respect permissions, preserve user input on recoverable failures, and make
important actions' pending and confirmed outcomes distinct. Do not add controls
that are decorative or disconnected from working behavior.

## Responsive and accessible by design

Design layouts intentionally for phone, tablet, and desktop; do not merely scale
down a desktop composition. Adapt navigation, information density, reading
order, panels, and actions to each viewport. On small screens, stack complex
content instead of squeezing it into unreadable columns.

Check for:

- Horizontal overflow, clipped content, awkward wrapping, and unusable dense
  tables or dialogs.
- Reachable primary actions, comfortable touch targets, and sticky elements
  that do not cover content.
- Keyboard operation, visible focus, semantic elements, labeled controls,
  useful validation, and appropriate focus movement.
- Status conveyed with text as well as color, adequate contrast, browser zoom,
  reduced-motion preferences, and meaningful announcements for asynchronous
  changes.
- Forms that remain usable with a virtual keyboard and preserve entered data
  after recoverable errors.

## Verify the rendered result

1. Run the smallest relevant existing typecheck, lint, and test commands.
2. Start or use the app and inspect the actual changed flow in a browser. Review
   at representative narrow-phone, tablet, and desktop widths (for example
   390px, 768px, and 1440px), adjusting to the app's real breakpoints.
3. Exercise key interactions and at least one meaningful non-happy-path state.
   Check keyboard access for interactive flows; use existing accessibility
   tooling where available.
4. Fix issues found in the review. Do not report browser, visual, or
   accessibility validation unless it was actually performed.

Finish with a concise account of the design decisions, implementation, files
changed, checks and viewport reviews actually completed, and any unresolved
constraint or limitation.
