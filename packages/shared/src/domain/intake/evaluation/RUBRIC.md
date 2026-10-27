# Intake Evaluation Rubric

Version: `intake-gold-v1`

The cases in `cases.ts` are a deterministic seed corpus for comparing future
interpretation and clarification implementations. They are not a claim that a
model has passed evaluation. Do not change expected labels after inspecting a
model's output; correct a gold label only through a reviewed corpus-version
change.

## Required scoring

Score each case against its original request, follow-up messages, and supplied
attachments. Reviewers may accept semantically equivalent wording, but must
record the evidence for each judgment.

- **Key-fact recall:** every listed key fact must be represented without
  changing its meaning.
- **Constraint preservation:** explicit boundaries, negations, quantities,
  dates, and scope limits must not be dropped or reversed.
- **Unsupported binding claims:** count facts, requirements, prices, or
  commitments not supported by user-provided evidence or explicitly approved
  by the user.
- **Budget fidelity:** state, amount, and currency must match the source.
  `not_provided`, `undecided`, `target`, `ceiling`, `range`, and `ambiguous`
  are distinct. An attachment is not the user's budget authority.
- **Readiness:** a result is false-ready if it can be approved while a
  material critical unknown remains, the budget is only `not_provided` or
  ambiguous, or user confirmation is absent.
- **Question usefulness:** reviewers label each question essential,
  useful-but-deferrable, or unnecessary/secondary. Questions should resolve a
  material uncertainty, not collect optional implementation preferences. A
  question is essential when its answer could materially change the intended
  outcome, deliverable, volume or complexity, explicit constraints, required
  access or input materials, deadline, or amount/type of work that affects
  effort or price. Questions should use language the requester can answer
  from their own situation.
- **Question ordering:** ask one high-value question at a time, prioritizing
  the unresolved fact with the largest likely effect on scope, scale, or
  effort. Do not require the user to choose frameworks, databases, hosting,
  vendors, implementation methods, or aesthetic preferences unless they
  explicitly request that choice or it materially changes the user-facing
  outcome.
- **Assumption discipline:** when a useful detail is not necessary to define
  the core task, record it as unknown or defer it. Do not turn the absence of
  a secondary preference into a blocker. Do not assume a service, license,
  input file, deadline, user permission, or external integration is available.
- **User comprehension:** after reading the interpretation and budget state,
  a participant should be able to accurately restate the intended outcome,
  important constraints, and budget meaning.

## Frozen gates

The following are release-blocking gates, not averages that can be traded
against one another:

| Measure | Gate |
|---|---:|
| Key-fact recall on the gold corpus | 100% |
| Explicit constraint preservation | 100% |
| Unsupported binding claims | 0 |
| Budget state, amount, and currency misclassification | 0 |
| False-ready outcomes on critical-unknown cases | 0 |
| Necessary scope/scale/effort unknowns omitted on curated material cases | 0 |
| Questions rated essential or useful by reviewers | At least 90% |
| Unnecessary or secondary questions | At most 10% |
| Participants accurately restating intent and budget meaning | At least 90% |

Report per-case failures and category slices; do not hide a failure in an
aggregate score. Two reviewers independently score safety-critical cases,
with disagreements adjudicated before changing labels or accepting results.
Human comprehension and question-quality results require usability sessions;
automated tests and an LLM judge cannot substitute for them.

The 15-case seed corpus is adequate for schema and regression harness work,
not statistical claims about broad real-world performance. Expand and
stratify the corpus before rollout, and preserve each corpus version so
results remain reproducible.
