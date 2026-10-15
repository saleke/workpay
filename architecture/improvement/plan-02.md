# WorkPay — Product & UX Design Specification

## 1. UX Objective

WorkPay is not primarily a dashboard, marketplace, payment application, or chatbot.

It is an **agentic work execution system**.

The user gives WorkPay an outcome they want.

WorkPay determines how that outcome can be accomplished, creates an enforceable agreement, finds an appropriate execution provider, commits money within the user's authority, monitors execution, verifies the resulting work, and settles payment when the contractual conditions have been satisfied.

The UX must make this complex process feel simple without hiding the important decisions.

The core experience should therefore be:

> **Tell WorkPay what you want. Understand what it intends to do. Give it bounded authority. Let it execute. See proof of completion.**

The user should feel:

**"I am delegating a job, not operating software."**

---

# 2. Design Around the User's Mental Model

The system internally contains:

- Tasks
- Work Specifications
- Contracts
- Providers
- Negotiations
- Agreements
- Payments
- Executions
- Submissions
- Evidence
- Verification
- Acceptance
- Cases
- Agent Runs
- Events

The user should not have to understand these concepts individually.

The user's mental model is much simpler:

```text
I have something I want done.
        ↓
What exactly will happen?
        ↓
Who is doing it?
        ↓
How much can it cost?
        ↓
Is my money protected?
        ↓
Is the work actually done?
        ↓
Why was the money released?
```

The UX should translate the internal system into those questions.

This leads to a fundamental principle:

> **The architecture may be complex. The user's mental model should remain simple.**

---

# 3. The Primary Product Loop

The entire product should revolve around one loop:

```text
INTENT
  ↓
UNDERSTANDING
  ↓
AGREEMENT
  ↓
EXECUTION
  ↓
EVIDENCE
  ↓
VERIFICATION
  ↓
SETTLEMENT
```

The user should be able to understand where their work currently sits in this loop at any moment.

The system should never force the user to reconstruct the state from multiple screens.

---

# 4. The Primary User: The Buyer

The primary user is someone who has a desired outcome but does not necessarily want to personally perform or manage the work.

Their ideal interaction is:

> "Here is what I need. Get it done."

They are not looking for:

- a project management system,
- a freelancer directory,
- a payment dashboard,
- an AI chat interface,
- or an automation builder.

They are looking for **delegation with control**.

That means the UX should optimize for:

1. clarity,
2. trust,
3. delegation,
4. observability,
5. recoverability.

---

# 5. The Home Experience

The home screen should not be a traditional SaaS analytics dashboard.

It should answer one question:

> **What do you want WorkPay to get done?**

The primary interaction should therefore be a large task composer.

```text
WorkPay

What do you need done?

┌──────────────────────────────────────────────┐
│                                              │
│ Clean and organize these 5,000 customer      │
│ records. Preserve the IDs and remove        │
│ duplicates.                                  │
│                                              │
│ 📎 customers.csv                             │
│                                              │
└──────────────────────────────────────────────┘

                         [ Get this done → ]
```

The user should be able to describe the work naturally.

They should not initially be confronted with:

- provider fields,
- contract fields,
- payment configuration,
- verification configuration,
- workflow settings.

WorkPay should extract those things progressively.

---

# 6. Progressive Clarification

The AI should not ask questions simply because information is missing.

It should ask questions only when the missing information can materially affect the outcome, cost, authority, or verification.

For example:

> "What format should the cleaned data be returned in?"

is useful.

But:

> "Would you like to specify a provider category?"

should not be necessary if WorkPay can determine that itself.

The principle is:

> **Ask only questions that the system cannot safely answer itself.**

This makes the agent feel intelligent rather than bureaucratic.

---

# 7. The "What I Understood" Moment

After the user describes a task, WorkPay should translate it into a human-readable agreement preview.

For example:

```text
Here's what I understood.

OUTCOME
Clean and normalize 5,000 customer records.

REQUIREMENTS
✓ Preserve every customer ID
✓ Remove duplicate records
✓ Normalize names and email addresses
✓ Preserve the required CSV structure

DEADLINE
Tomorrow · 6:00 PM

MAXIMUM SPEND
$150

PAYMENT
Released only after the work passes verification.

[ Edit ]                 [ Looks good ]
```

This is one of the most important screens in the product.

It gives the user confidence that:

> **The AI understood me before I let it act.**

---

# 8. The Agreement Should Be Human-Readable

The underlying Work Contract remains the authoritative machine-readable object.

But the UX should never expose it primarily as a technical document.

Instead of:

> Contract v1.3 — Hash: 8f73...c21a

show:

### What you're agreeing to

Then explain:

- what will be done,
- what must be true when finished,
- the deadline,
- the maximum spend,
- what the agent can do,
- when payment can be released.

Technical information can be available through:

> **View technical agreement**

but should remain secondary.

---

# 9. The Most Important Trust Question: "What Can the Agent Do?"

Before giving the agent economic authority, the user should clearly understand its limits.

The product should present something like:

```text
Your agent can

✓ Find suitable providers
✓ Compare options
✓ Negotiate within your limits
✓ Commit up to $150
✓ Monitor the work
✓ Verify the submission

Your agent cannot

✕ Spend more than $150
✕ Change the requirements
✕ Change the deadline without permission
✕ Release payment after failed verification
✕ Override a dispute or safety rule
```

This should not feel like a permissions page.

It should feel like:

> **"Here is what I am allowing my agent to do."**

---

# 10. Economic Authority Must Be Visible Before Delegation

The user's most sensitive resource is money.

Therefore, before the agent acts, the user should see:

```text
Maximum spend       $150
Agreed currency     USD
Payment condition   Successful verification
Agent autonomy      Within this task
```

The user should never wonder:

> "Can the agent spend more than I intended?"

The answer should always be visible.

---

# 11. The Task Room

Once a task has been created, the **Task Room** becomes the central product experience.

The user should not need to visit separate screens to understand what is happening.

A Task Room should look conceptually like:

```text
← Work

Clean 5,000 customer records

$135 committed · In progress
Due tomorrow · 6:00 PM

────────────────────────────────────────

PROGRESS

✓ Agreement
✓ Provider hired
● Work in progress
○ Verification
○ Payment

────────────────────────────────────────

WHAT'S HAPPENING

DataWorks is currently cleaning your dataset.

Expected completion:
~8 hours

────────────────────────────────────────

AGREEMENT

5,000 records
Duplicate rate <1%
No missing IDs
Deadline tomorrow
Maximum spend $150

[ View agreement ]

────────────────────────────────────────

ACTIVITY

10:02  You created the task
10:03  Agreement created
10:04  Provider selected
10:05  $135 committed
```

This becomes the user's home while a task is active.

---

# 12. The Task Room Has Four Layers

The Task Room should organize information into four conceptual layers.

### Layer 1 — Outcome

What is being accomplished?

### Layer 2 — State

What is happening right now?

### Layer 3 — Evidence

Why does WorkPay believe the work is or isn't complete?

### Layer 4 — Money

What financial state follows from that evidence?

This is more useful than organizing the interface according to backend components.

---

# 13. Status Must Be Human, Not Technical

Never make the primary UI say:

```text
AUTHORIZATION_REQUESTED
VERIFICATION_RUNNING
CAPTURE_PENDING
AGENT_STATE_17
```

Instead:

```text
Finding a provider
Provider hired
Work in progress
Checking the submission
Revision required
Work accepted
Payment released
```

The backend can maintain precise state machines.

The UI should communicate **meaning**.

---

# 14. The User Should Always Know Three Things

At the top of an active task, WorkPay should make three things immediately visible:

### What is happening?

> Provider is working.

### What happens next?

> Submission will be verified when received.

### What happens to my money?

> $135 is committed and protected.

If the user can answer those three questions within seconds, the UX is working.

---

# 15. Provider Selection Should Be an Agent Recommendation

The user should not browse a traditional freelancer marketplace.

WorkPay should say:

```text
I found 3 providers who can complete this work.

RECOMMENDED

DataWorks
$135
~8 hours
96% first-pass acceptance

Why I chose them:
Best expected completion probability
within your $150 budget.

────────────────────

Alternative

FastData
$110
~12 hours
89% first-pass acceptance

Cheaper, but historically requires
more revisions.

[ View providers ]
```

The agent does the search.

The user receives the decision context.

---

# 16. Negotiation Should Be Invisible by Default

Negotiation is an agent capability, not necessarily a user workflow.

The user should primarily see:

> **Agreed price: $135**

Optionally:

> The agent negotiated the provider from $150 to $135.

Only users who want more detail should open:

> View negotiation

This keeps the product focused on outcomes rather than mechanics.

---

# 17. The Money State Must Be Different From Normal Payment UX

WorkPay is not a normal checkout experience.

The user isn't simply paying $135.

The user is making an economic commitment whose settlement is conditional on work.

Therefore, the UI should communicate:

```text
$135

COMMITTED
Protected while work is completed

       ↓

WORK SUBMITTED

       ↓

VERIFYING

       ↓

ACCEPTED

       ↓

SETTLED
```

The phrase **"committed"** is particularly important.

It communicates that money has been economically reserved without implying that the provider has already earned it.

---

# 18. "Money Follows Proof"

This should become one of the central UX principles.

The interface should repeatedly reinforce:

> **Money follows proof.**

The sequence is:

```text
Agreement
    ↓
Work
    ↓
Evidence
    ↓
Verification
    ↓
Payment
```

This is the simplest explanation of why WorkPay exists.

---

# 19. Verification Is the Product's Signature Moment

When work is submitted, WorkPay should make verification visible.

For example:

```text
VERIFYING WORK

Checking 5 requirements...

✓ 5,000 records
✓ IDs preserved
✓ Schema valid
✓ Missing IDs: 0
✓ Duplicate rate: 0.4%

5 / 5 passed

✓ WORK ACCEPTED
```

Then:

```text
$135

✓ PAYMENT RELEASED
```

This should feel almost like a transaction confirmation.

Because conceptually, it is.

The system has converted **evidence into economic settlement**.

---

# 20. Failure Should Be Visible and Reassuring

A bad submission should not make the product feel broken.

It should make the product feel **safe**.

For example:

```text
WORK NEEDS REVISION

3 of 5 requirements passed.

✕ Duplicate rate
Expected: <1%
Found: 7.2%

✕ Missing IDs
Expected: 0
Found: 14

✓ Record count
✓ Schema
✓ Name normalization

Payment remains protected.

The provider has been asked to correct
the submission.
```

This is an extremely important UX moment.

The user should think:

> "Good. The system caught it."

Not:

> "Something went wrong."

---

# 21. Verification Results Should Show Expected vs Actual

Never simply say:

> Verification failed.

Instead:

```text
Requirement
Duplicate rate <1%

Expected
< 1%

Observed
7.2%

Result
FAILED
```

This makes the system's judgment understandable.

For AI-based semantic checks, the UI should similarly provide:

- requirement,
- result,
- evidence,
- explanation,
- confidence where useful.

But it should never expose hidden model reasoning.

---

# 22. AI Transparency Should Mean Decision Provenance

The user does not need chain-of-thought.

They need:

> **What did the AI decide, and why does the system trust that decision?**

For example:

> **Provider selected**

> DataWorks was selected because it met all required capabilities and had the highest expected completion score within your $150 limit.

Or:

> **Payment released**

> All five mandatory acceptance requirements passed against contract version 2.

That is meaningful transparency.

---

# 23. The Activity Timeline Should Tell the Story

The timeline should read naturally.

Bad:

```text
PAYMENT_AUTHORIZED
AGENT_ACTION_18
VERIFICATION_RUN_4
CAPTURE_REQUESTED
```

Good:

```text
10:02
You asked WorkPay to clean 5,000 records.

10:03
I created an agreement with 5 measurable requirements.

10:04
I selected DataWorks for $135.

10:05
$135 was committed through PayPal.

10:07
DataWorks submitted the first version.

10:08
Verification failed:
duplicate rate was 7.2%.

10:12
DataWorks submitted a correction.

10:13
All 5 requirements passed.

10:13
$135 was released.
```

The timeline should tell the story of the economic transaction.

---

# 24. The User Should Not Need to Monitor the Task

This is a critical product test.

If the user has to repeatedly refresh the application to understand whether the provider has finished, WorkPay has failed at delegation.

The system should notify the user only when:

- input is required,
- a decision requires approval,
- something unusual happened,
- verification failed,
- work was accepted,
- payment was released,
- or the task completed.

The default state should be:

> **WorkPay is handling it.**

---

# 25. Exceptions Should Be Designed as "Needs Your Attention"

Cases and disputes should not feel like administrative modules.

Instead:

```text
Something needs your attention.

Verification is uncertain.

The system could not confidently determine
whether the submitted descriptions satisfy
the quality requirement.

[ Review evidence ]
```

The user is brought into the system only when the automation genuinely needs human judgment.

This reinforces the value of autonomy.

---

# 26. The User Should Always Have an Escape Hatch

Autonomy should never feel like surrendering control.

At any meaningful point the user should be able to:

- pause the task,
- cancel where contractually possible,
- review the agreement,
- review evidence,
- inspect payment status,
- contact or communicate with the provider where appropriate,
- escalate an exception.

The user should feel:

> **"The agent is working for me, not taking over from me."**

---

# 27. Autonomy Should Be a Product Setting

The user should be able to choose how much authority WorkPay has.

For example:

### Conservative

> Ask me before committing money.

### Balanced

> Automatically act within my limits. Ask me when something unusual happens.

### Autonomous

> Handle tasks automatically within my economic and contract policies.

This is much more powerful than simply having a generic "AI settings" page.

---

# 28. The Provider Experience

The provider should experience WorkPay as a **clear, fair work system**, not as a complex AI platform.

The provider sees:

```text
Clean 5,000 customer records

$135

Deadline
Tomorrow · 6:00 PM

Requirements
✓ Preserve IDs
✓ Duplicate rate <1%
✓ Valid CSV structure

[ Accept work ]
```

Once accepted:

```text
WORK IN PROGRESS

Upload your completed work when ready.

[ Submit for verification ]
```

If the submission fails:

```text
Revision required

Duplicate rate:
7.2%

Required:
<1%

Payment remains protected.

[ Submit revision ]
```

The provider should always understand:

> **What must I do to earn the payment?**

That is the provider-side equivalent of buyer trust.

---

# 29. The Same Contract Should Explain Fairness to Both Sides

This is an important product advantage.

The buyer sees:

> "My money is protected until the work meets the agreement."

The provider sees:

> "My payment is committed and will be released when the agreed requirements are satisfied."

Both sides are governed by the same artifact:

**the Work Contract.**

This is stronger than a marketplace where one party simply rates or disputes the other.

---

# 30. Navigation Should Be Minimal

The buyer should not see the internal architecture reflected in navigation.

Recommended:

```text
WorkPay

Home
Work
Payments
Settings
```

Within Work:

```text
Active
Needs attention
Completed
```

The provider experience can use:

```text
Available
My Work
Payments
Profile
```

There should not be top-level navigation for:

- Contracts
- Providers
- Negotiations
- Verification
- Cases
- Agent Runs

Those are system capabilities, not necessarily user destinations.

---

# 31. The Visual Language

WorkPay should not look primarily like a freelancer marketplace.

Avoid making the product feel like:

- a gig marketplace,
- a generic project-management tool,
- an AI chatbot,
- or a payment checkout page.

The visual language should communicate:

**AI workspace + financial infrastructure + operational trust.**

The interface should feel:

- calm,
- precise,
- trustworthy,
- modern,
- information-dense without being cluttered.

Status and evidence should be visually stronger than decoration.

---

# 32. The Product Should Have One Signature Interaction

The most memorable interaction should be:

### Work accepted → money released.

For example:

```text
┌──────────────────────────────────────┐
│                                      │
│         WORK ACCEPTED                │
│                                      │
│         5 / 5 requirements passed    │
│                                      │
│         ────────────────────         │
│                                      │
│              $135                    │
│                                      │
│         PAYMENT RELEASED             │
│                                      │
└──────────────────────────────────────┘
```

The user should immediately understand:

> **The system didn't just decide to pay. It proved why payment was deserved.**

That is the product's core interaction.

---

# 33. The MVP Should Optimize for One Exceptional Experience

We should resist building:

- ten dashboards,
- extensive analytics,
- complex provider profiles,
- elaborate messaging,
- advanced reputation systems,
- dozens of settings.

The MVP should make one flow exceptional:

```text
Create task
   ↓
Understand agreement
   ↓
Approve authority
   ↓
Provider selected
   ↓
Money committed
   ↓
Work submitted
   ↓
Bad submission caught
   ↓
Revision
   ↓
Verification passes
   ↓
Money released
```

If that flow feels magical, the product works.

---

# 34. The UX Architecture

The resulting product can be understood as five user-facing surfaces.

```text
                    WORKPAY
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      CREATE         WORK          SETTINGS
        │              │              │
        │         TASK ROOM          │
        │              │              │
        │       ┌──────┼──────┐       │
        │       │      │      │       │
        │     STATE  EVIDENCE MONEY   │
        │       │      │      │       │
        │       └──────┼──────┘       │
        │              │              │
        └──────────────┼──────────────┘
                       │
                  PROVIDER
```

The Task Room remains the center.

---

# 35. The Complete Ideal Journey

A user should experience WorkPay like this:

```text
1. USER

"Clean these 5,000 records."

                ↓

2. WORKPAY

"Here's what I understood."

                ↓

3. USER

"Looks good."

                ↓

4. WORKPAY

"I found the best provider for $135."

                ↓

5. WORKPAY

"$135 is committed within your limits."

                ↓

6. PROVIDER

Performs the work.

                ↓

7. WORKPAY

"Work submitted. Verifying."

                ↓

8. WORKPAY

"Verification failed."

                ↓

9. PROVIDER

Corrects the work.

                ↓

10. WORKPAY

"5/5 requirements passed."

                ↓

11. PAYPAL

"$135 released."

                ↓

12. USER

"Done."
```

The user does not operate the workflow.

**They delegate it.**

---

# 36. The Fundamental UX Principle

The entire product should follow one rule:

> **Complexity should appear only when the user needs to make a decision.**

If no decision is required, the system handles it.

If a decision is required, WorkPay explains:

1. what happened,
2. why it matters,
3. what the options are,
4. what happens after each option.

This is how the system remains powerful without becoming overwhelming.

---

# 37. The Product's Core UX Promise

Everything ultimately reduces to one promise:

> **Tell WorkPay what you want done. Give it bounded authority. WorkPay handles the execution and makes sure your money follows the proof.**

That promise should be visible in the product's:

- onboarding,
- task creation,
- agreement UX,
- agent permissions,
- task room,
- provider selection,
- verification,
- payment,
- notifications,
- and completion experience.

---

# 38. Final Product Experience

The final UX model should therefore be:

```text
                 USER INTENT
                      │
                      ▼
              "What do you need?"
                      │
                      ▼
              WHAT I UNDERSTOOD
                      │
                      ▼
               WORK AGREEMENT
                      │
                      ▼
              BOUNDED AUTHORITY
                      │
                      ▼
               AGENT EXECUTION
                      │
             ┌────────┴────────┐
             │                 │
             ▼                 ▼
         PROVIDER            MONEY
             │              COMMITTED
             │                 │
             └────────┬────────┘
                      ▼
                    WORK
                      │
                      ▼
                  EVIDENCE
                      │
                      ▼
                VERIFICATION
                      │
                ┌─────┴─────┐
                │           │
              FAIL         PASS
                │           │
             REVISION       │
                │           │
                └─────┐     │
                      │     │
                      ▼     ▼
                    WORK → SETTLEMENT
                              │
                              ▼
                            PAYPAL
```

The most important shift is this:

> **The user should never feel like they are operating the machinery we designed.**

They should feel like they have an intelligent, economically bounded operator working on their behalf.

The machinery exists to make that delegation **safe, observable, verifiable, and financially accountable**.

And the product's deepest UX message becomes:

# **Tell it what to do.**
# **Let it handle the work.**
# **See the proof.**
# **Know why the money moved.**