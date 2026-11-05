# WorkPay Copilot instructions

- For frontend design, UI/UX review, or responsive UI implementation, use the
  `workpay-ui-ux` skill in `.github/skills/workpay-ui-ux/SKILL.md`.
- Preserve established product behavior and UX constraints. Before relying on
  repository documentation, check the authority order in
  `architecture/ENGINEERING_PLAN.md` §0 and any relevant entries in
  `OPEN-DECISIONS.md`. If authoritative sources conflict on a consequential
  behavior, surface the conflict instead of silently choosing or inventing a
  policy.
- Treat Figma as visual and interaction context, not as permission to override
  product requirements, accessibility, responsive behavior, backend truth, or
  user control. Adapt the reference when needed and explain material deviations.
- Inspect the relevant route, components, tokens, API behavior, and tests before
  changing the UI. Implement functioning interactions and relevant states, then
  verify the rendered experience at mobile and desktop sizes.
- Do not claim a visual review or test passed unless it was actually performed.
