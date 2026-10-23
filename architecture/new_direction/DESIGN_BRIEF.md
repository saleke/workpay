# WorkPay Design Brief

## 1. Purpose and authority

This document defines how WorkPay looks, reads, and behaves for the user. Read it in full before any UI work.

- The architecture documents decide behavior, state, and authority. This brief decides presentation and interaction.
- If the two conflict on behavior, the architecture wins. If they conflict on presentation, this brief wins.
- `tokens.css` is the only source for color, type, spacing, and motion values.
- `reference/screens.html` is the visual reference. When a screen is built, it is compared against that file at three widths.

## 2. The concept

WorkPay's interface is a contract. Every consequential screen is a pale sheet of paper lying in a dark room. The sheet is the product: it states what was agreed, shows what has been proven against it, and says in plain sentences where the money is.

This concept exists because the product thesis is "money follows proof". A contract is the one object that makes that visible. The interface should never look like a dashboard that happens to show contracts.

Three consequences follow, and they apply everywhere:

1. The paper is the only bright object on any screen. Everything else is the dark room.
2. State is written in words, in ink. It is never conveyed by an icon, a dot, a colored box, or color alone.
3. Money is stated as a sentence tied to the contract, not as a floating figure.

## 3. Rules that are not negotiable

1. **One sheet per screen.** Do not place sheets inside sheets, and do not stack several sheets on one screen.
2. **Serif is the voice, sans is the chrome.** Contract text, task titles, requirements, amounts, and notes use the serif. Navigation, small labels, metadata, state labels, and buttons use the sans.
3. **No status icons.** No ticks, crosses, dots, pills with icons, or colored squares. Status is a written word or sentence. Ink color may accompany it but must never carry it alone.
4. **No cards.** No rounded panels, no drop shadows, no gradients, no glow, no tinted backgrounds for grouping. Structure comes from hairline rules and spacing.
5. **No dashboard tiles.** No KPI numbers floating above labels. A figure always sits inside a sentence or a labeled line on the sheet.
6. **Two weights only.** 400 and 500. Sentence case everywhere. No all-caps labels. No tracked-out eyebrow labels.
7. **Metadata is written, not dotted.** Write "LinguaWorks, due in 2 hours", not "LinguaWorks · due in 2h". Do not join strings with middle dots or spaced dashes. Do not append arrows to buttons or links.
8. **Every state has words.** Loading, waiting, failure, and empty states all say what is happening and what the user should do, if anything.
9. **Never expose internal state names.** Translate every backend state into the product language in section 4.
10. **There is no force-payment action.** Human decisions feed the same backend policy as everything else. The interface offers "Accept the work", "Ask for a revision", and "Open a dispute", and nothing that bypasses verification.
11. **One solid button per view.** All other actions are outlined or plain text.

## 4. Terminology

Use these terms exactly in all user-facing text. Code identifiers may differ, but strings may not.

| Concept | Use | Do not use |
|---|---|---|
| What must be true for payment to be released | Requirement | Clause, criterion, acceptance criterion |
| Outcome of a requirement | Met, Not met, Unsure | Pass, Fail, Uncertain |
| Granting the agent authority | Sign | Approve, Confirm |
| What the user asks for | Task | Job, Request |
| The document WorkPay drafts | Contract | Agreement, Spec |
| Who does the work | Provider | Vendor, Worker |
| Money committed to a task | Held | Authorized, Escrowed, Reserved |
| Money delivered to the provider | Paid | Captured, Settled |
| Automated checking | Verification | Validation, QA |
| A person must decide | Review needed | Escalated, Manual review |
| Provider must fix the work | Revision requested | Rejected, Failed |
| The user's maximum spend | Spend up to | Budget cap, Ceiling |

Primary action labels:

- Signing: **Sign and let WorkPay hire**, with **Edit requirements** as the secondary action.
- Creating a task: **Draft the contract**.
- Providers: **Accept work**, **Submit for verification**.

## 5. Visual system summary

Values live in `tokens.css`. In summary:

- **Room:** near-black, warm text. Holds navigation, lists of tasks only when they are not on a sheet, and waiting states.
- **Paper:** a warm off-white sheet with dark ink text and hairline rules in a darker paper tone.
- **State ink:** green for met or paid, red for not met or revision requested, amber for unsure or review needed. A lighter variant of each is used on the room. Words always accompany the color.
- **Type:** Source Serif 4 for the voice, IBM Plex Sans for the chrome. Amounts use tabular, lining figures.
- **Shape:** the sheet has a 2px corner radius. Controls have a 4px radius. Nothing is rounder.
- **Motion:** one idea only. A stamp presses onto the sheet (160ms) when a payment state changes. Everything else is static. Respect `prefers-reduced-motion`.

## 6. Layout and responsive behavior

The sheet is a single column that reads top to bottom. This is true at every width. Desktop adds margin, not columns.

- **960px and wider:** the sheet is centered at a maximum width of 46rem. A margin column of 13rem sits beside it and holds annotations, such as the written status of each requirement and evidence excerpts, the way notes sit beside a real contract.
- **640px to 959px:** the margin column is removed and its annotations appear directly beneath the item they describe.
- **Under 640px:** the sheet is nearly edge to edge with a thin strip of room visible. Every grid and table becomes a stack of entries in reading order. Nothing scrolls horizontally.

Rules for the small widths:

- A table row becomes an entry: the term in serif, then labeled values on separate lines.
- A register row becomes an entry: title, provider line, written note, then the money on the left and the state label on the right.
- Actions sit at the bottom of the sheet, full width and stacked, with the primary action first. The reassurance line about held money sits directly above them.
- Navigation is four words along the bottom edge: Tasks, Payments, Activity, Settings. No icons.

## 7. Screens

### 7.1 Application shell

- Room background. A wordmark in the serif at the left. Navigation as plain words: Tasks, Payments, Activity, Settings. The current location is in the strong text color, the others in the muted color.
- A single solid **New task** control in the paper color sits at the right of the header. It is the only bright element in the shell.
- The provider role sees Available work, My work, Payments, and Profile, using the same shell.
- The shell stays visually quiet. It must never compete with the sheet.

### 7.2 Tasks (the register)

The task list is a register: one paper sheet that indexes the user's contracts.

- Columns on wide screens: Contract, Money, State. On narrow screens each row becomes an entry.
- Rows are grouped under plain headings: Needs your attention, In progress, Completed. Empty groups are omitted.
- Each row contains: the task title in serif at the lead size; the provider line and due time written with commas; and one italic written note that states the situation, for example "Four of five requirements met. Duplicates are 7.2%, and the limit is 1%."
- Money is written as an amount followed by "held" or "paid". The state label is outlined words in the matching ink: Review needed, Revision requested, Work in progress, Paid.
- There are no per-requirement marks in the list. Requirement detail lives on the task workspace.
- Empty state: a sentence that invites action, with the **New task** control. Example: "Give WorkPay something to do."

### 7.3 New task

The new task screen is a blank sheet.

- Meta line: "New task. WorkPay turns this into a contract for you to sign."
- A single large line for the question "What do you need done?" with a ruled line beneath it. Allow it to grow.
- Three fields written as ruled blanks: Spend up to, Finish by, Files. These are underlined fields, not boxed inputs.
- One solid button: **Draft the contract**.
- After submission, show the waiting state in section 7.10 rather than a spinner.
- Ask no more than three clarifying questions, presented on the same sheet in the same written style.

### 7.4 Contract approval (signing)

This is the most important trust moment in the product. It is a full page, never a modal.

Order of content on the sheet:

1. Meta line: "Work contract, draft v1, prepared by WorkPay, not yet signed."
2. The task title and a one-sentence statement of what will be done.
3. A rule, then the line "Payment is released only when every requirement is met", followed by the numbered requirements as plain serif text. Numbers are used here because requirements are referred to by number elsewhere.
4. A rule, then three labeled terms in a row: Spend up to, Deadline, Expected price.
5. A rule, then two blocks. **WorkPay may**: find and negotiate with providers within your limit, authorize up to the limit, request corrections. **WorkPay may not**: raise your limit, change a requirement, pay for work that fails a requirement. Use green and red ink for the two block labels.
6. A signature line separated by a rule: the solid button **Sign and let WorkPay hire**, and the plain secondary action **Edit requirements**.

After signing, the sheet is stamped in its meta line: "Signed by you at 10:03, version 3." If a provider proposes a change that alters terms, the user sees a new contract version with the previous and new terms side by side in written form, and must sign again. Never present a new version as the old one.

### 7.5 Task workspace (the contract in force)

This is the central screen. It is the same sheet as the contract, now with proof written into it.

Order of content:

1. Meta line: "Contract v3, signed by you at 10:03." Then the task title.
2. A one-sentence money statement directly under the title, for example "$135 is held. It is released only when every requirement is met." After success: "$135 was paid to DataWorks at 10:13."
3. The numbered requirements. Each has its status written in ink beside it in the margin column on wide screens, and beneath it on narrow screens. Examples: "Met", "Found 7.2%. Not met.", "Unsure. The verifier could not decide."
4. For any requirement that is Not met or Unsure, show the evidence directly beneath it in serif: the measured value, the required value, and a link to the full evidence.
5. The stamp, placed at the lower right of the sheet. It reads "Payment held" in red ink while payment is protected and "Paid" in green ink after capture. This is the only place a rotated stamp appears.
6. A rule, then the Activity section: dated, written entries in plain sentences, newest at the bottom. These come from the event stream and must never be invented by the interface.
7. If a human decision is needed, the actions appear at the bottom as in section 7.8.

Content that belongs to other screens (provider comparison, negotiation record) is reached through plain text links within the sheet, not shown by default.

### 7.6 Provider choice and negotiation record

Appears on the task workspace, in a section titled Provider.

- The chosen provider's name at title size, with price, time, and pass rate written as a sentence.
- One italic note explaining why they were chosen.
- A short heading "Also considered" with at most two alternatives, each with a written reason for not choosing them, for example "Would miss your deadline." More alternatives sit behind a plain "Show all providers" text link.
- A heading "How the price was agreed" with the offers in sequence, each written as who, what, and when.
- Show decision factors and outcomes. Never show model reasoning traces.

### 7.7 A price above the user's limit

A full sheet titled with the situation, for example "DataWorks asked for $165".

- One explanatory sentence: "You told WorkPay to spend up to $150. It cannot accept a price above that, and it cannot raise your limit for you."
- Actions: **Raise your limit** (solid) and **Find another provider** (outlined).
- A reassurance line: "Nothing is held until you decide."

### 7.8 Review needed (verification unsure)

Used when verification cannot decide a requirement.

- Meta line naming the task. Title: "Verification could not decide requirement 5".
- The requirement text, then an amber italic note summarizing the evidence, for example "38 of 41 terms matched. Three were unclear."
- The unclear items as a short ruled list. On wide screens: Term, Approved list says, Submitted work says. On narrow screens: one entry per item with those two lines labeled.
- The reassurance line: "$80 stays held until you decide."
- Actions: **Accept the work**, **Ask for a revision**, **Open a dispute**. One solid, two outlined.
- Large evidence sets are shown as a summary with the first few examples and a plain link to a full appendix page. On phones, the appendix is a deliberate separate step.

### 7.9 Provider portal

Providers see the same sheet from the other side. It is called a Work order and is intentionally simpler.

- Meta line: "Work order, contract v3, from a verified buyer."
- The task title, then three labeled facts: You are paid, When, Due. The "When" fact reads "Once every requirement is met".
- The numbered requirements, the input files, and one solid button: **Accept work**. After acceptance the button becomes **Start work**, then **Submit for verification**.
- State clearly that submitting work does not trigger payment. Verification does.
- Provider-supplied content and files are untrusted. Escape and sandbox them.

### 7.10 Payments and Activity pages

- **Payments:** a register on paper listing money by task, each row stating the amount and "held", "paid", or "refunded" in words, with the task title as the entry. Held and paid are never confused.
- **Activity:** a single sheet of dated, plain-sentence entries grouped by day. Each entry links to its task.

### 7.11 Waiting, failure, and empty states

These sit on the room, not on a sheet, because nothing has been decided yet. Each has a serif heading and one or two lines of muted text.

| Situation | Heading | Text |
|---|---|---|
| Drafting a contract | Drafting your contract… | Three written steps with the current one in the strong text color: Read your request, Writing the requirements, Finding providers. |
| PayPal is slow | PayPal is slow today | Your $135 is safe and being checked. You do not need to retry. |
| Connection lost | Connection lost | Your task is still running. Reconnecting… |
| Agent could not finish a step | This step could not finish | No payment was released. Review needed. |
| No tasks | Give WorkPay something to do | One line of explanation and the New task control. |

Never imply an operation failed because the browser lost its connection. An ellipsis is used only for in-progress states.

## 8. Accessibility

- Every state is readable without color because it is written. Do not remove the words to save space.
- Target a contrast ratio of at least 4.5:1 for all text. The token values were chosen for this. Verify with an automated check whenever a token changes.
- All controls are reachable by keyboard, with a visible focus ring from `tokens.css`.
- Announce realtime state changes through an `aria-live="polite"` region.
- Confirm consequential actions with a clearly worded step, never with a generic "Are you sure?".
- Respect `prefers-reduced-motion`. The stamp animation must be removed in that case.

## 9. Patterns the agent must not produce

If an implementation contains any of the following, it is wrong and must be redone, not patched:

- Rounded cards in a grid, or a dashboard of metric tiles.
- Status pills with icons, colored dots, ticks, crosses, or colored squares.
- A shadow, gradient, or blur anywhere.
- A modal for contract signing.
- A spinner where a written waiting state belongs.
- Raw hex values, raw pixel sizes, or fonts that are not in `tokens.css`.
- All-caps labels, spaced-dash labels, middle-dot metadata strings, or arrows on buttons.
- Backend state names or error codes shown to the user.
- More than one solid button in a view.

## 10. Definition of done for any UI change

1. The screen is rendered at 375px, 768px, and 1280px and screenshots are compared against `reference/screens.html`.
2. All user-facing strings use the terms in section 4.
3. No raw color, size, or font appears in component code.
4. Every state has a written explanation.
5. Keyboard navigation and focus are verified.
6. The agent reports honestly where the result falls short of the reference, instead of reporting only that it is done.
