# UI rules for coding agents

Merge this block into the root `CLAUDE.md` or `AGENTS.md`. Keep it short. Every line prevents a mistake that has already happened.

## Before any UI work

1. Read `design/DESIGN_BRIEF.md` in full and `design/tokens.css`.
2. Open `design/reference/screens.html` and treat it as the visual reference.
3. For any screen that is not covered by the brief, stop and ask. Do not invent a new pattern.

## Hard rules

- Do not change business logic, data models, state machines, or API contracts while doing UI work. If a UI change seems to require one, stop and ask.
- All color, type, spacing, radius, and motion values come from `design/tokens.css`. Never write a raw hex value, pixel size, or font name in component code.
- The UI is a paper sheet in a dark room. Each screen has one sheet and nothing else bright.
- State is written in words in ink. Do not use icons, dots, ticks, crosses, colored squares, or color alone to show state.
- Do not use cards, shadows, gradients, rounded panels, KPI tiles, or modals for contract signing.
- Use the terminology table in section 4 of the brief exactly. The words "clause", "authorized", "captured", "approve", and "failed" never appear in user-facing text.
- One solid button per view. Sentence case. No all-caps labels, no middle-dot metadata strings, no arrows on buttons.
- Never display backend state names or error codes. Translate them into the product language.
- The frontend is never authoritative for money, permissions, contract contents, or verification results.

## Process for any screen

1. Write a short plan first: the content order, the sheet structure, and how it stacks at 375px. Wait for approval on new screens.
2. Build with fake data until the screen matches the reference. Wire real data after.
3. Render at 375px, 768px, and 1280px and compare against the reference.
4. If the structure is wrong, revert and rebuild with a sharper constraint. Do not stack revisions on a flawed layout.
5. Report honestly where the result falls short of the reference. Do not report "done" without running the checks.

## Checks to run before reporting done

- Typecheck, lint, and tests pass.
- No raw color, size, or font values in changed files.
- No banned terms in changed strings.
- Keyboard navigation and visible focus work on every new control.
