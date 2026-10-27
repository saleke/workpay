import { z } from "zod";
import { unknownImpactSchema } from "../model.js";

export const journeyActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("interpret"),
      assistantIntent: z.string().min(1),
      avoid: z.array(z.string()),
      expectedSummaryPerspective: z.enum(["direct_or_task_focused"]).optional(),
      expectedFamiliarity: z.enum(["unknown", "new_to_task", "some_experience", "experienced"]),
      expectedStyle: z.enum(["plain_language", "balanced", "technical"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("clarify"),
      question: z.string().min(1),
      impact: unknownImpactSchema,
      userReply: z.string().min(1),
      avoid: z.array(z.string()),
      expectedWhyItMatters: z.string().min(1).optional(),
      expectedAnswerOptions: z
        .array(
          z
            .object({
              label: z.string().min(1),
              explanation: z.string().min(1),
            })
            .strict(),
        )
        .max(4)
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("confirm_budget"),
      userReply: z.string().min(1),
      expectedState: z.enum([
        "not_provided",
        "undecided",
        "ceiling",
        "target",
        "range",
        "ambiguous",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("approve"),
      userReply: z.string().min(1),
      mustPreserve: z.array(z.string()).min(1),
    })
    .strict(),
]);

export const simulatedIntakeJourneySchema = z
  .object({
    id: z.string().min(1),
    profile: z.string().min(1),
    request: z.string().min(1),
    actions: z.array(journeyActionSchema).min(2),
    completionCriteria: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type SimulatedIntakeJourney = z.infer<typeof simulatedIntakeJourneySchema>;

export const INTAKE_SIMULATED_JOURNEYS: SimulatedIntakeJourney[] = [
  {
    id: "nontechnical-bakery-website",
    profile: "A bakery owner who knows the business goal but not web terminology.",
    request: "I don't know anything about making websites, but I want one for my bakery.",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Confirm whether the user needs a site that shares information, accepts orders, or both. Do not choose a technical solution.",
        avoid: ["React vs WordPress", "database selection", "brand colors", "hosting provider"],
        expectedFamiliarity: "new_to_task",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question:
          "Should customers be able to place orders on the website, or should it mainly show your bakery's information?",
        impact: "objective",
        userReply: "Customers should be able to order cakes for pickup.",
        avoid: [
          "framework choice",
          "color palette",
          "payment processor before checkout scope is clear",
        ],
      },
      {
        type: "clarify",
        question:
          "About how many cakes or products should customers be able to choose from at launch?",
        impact: "scale",
        userReply: "Around 25 cakes, with a few size choices for each.",
        avoid: ["exact product database schema", "future product catalog features"],
      },
      {
        type: "clarify",
        question:
          "Should customers pay when ordering, or submit an order request for you to confirm and collect payment later?",
        impact: "price_impact",
        userReply: "They should pay when they place the order.",
        avoid: ["payment gateway brand", "merchant API implementation"],
      },
      {
        type: "confirm_budget",
        userReply: "I don't know my budget yet.",
        expectedState: "undecided",
      },
      {
        type: "approve",
        userReply: "Yes, that's what I need.",
        mustPreserve: [
          "Bakery ordering website",
          "Pickup orders",
          "About 25 cakes with size choices",
          "Payment at order time",
          "Budget explicitly undecided",
        ],
      },
    ],
    completionCriteria: [
      "Clarifications establish the user-facing function, approximate catalog scale, fulfillment, and payment timing.",
      "The user is not asked to select technical architecture or optional visual details.",
      "No price is estimated or presented as the user's budget.",
    ],
  },
  {
    id: "hosting-business-nontechnical-recommendation",
    profile:
      "A business owner who has hosting hardware but does not know which customer-facing platform features to choose.",
    request:
      "I am starting a web hosting business. I have the hardware, but I need a website customers can use to get hosting.",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Capture the hosting business goal without assuming a particular control panel, billing system, or account architecture. Summarize it directly or as a neutral task statement; do not narrate the requester in the third person or assume the work is for them personally.",
        avoid: [
          "assuming a specific hosting panel",
          "asking the user to research infrastructure terms",
          "referring to the requester as 'the user' in the summary",
          "assuming the requester is the task's beneficiary",
        ],
        expectedSummaryPerspective: "direct_or_task_focused",
        expectedFamiliarity: "new_to_task",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question: "What should a customer be able to do first when they visit your site?",
        impact: "objective",
        expectedWhyItMatters:
          "This determines whether customers can complete a purchase themselves or need to contact you; taking payments online can require more work than a simple inquiry form.",
        userReply: "Let customers choose a plan and pay online",
        expectedAnswerOptions: [
          {
            label: "Show my plans and let customers contact me",
            explanation: "A simple way to start without taking payments on the site.",
          },
          {
            label: "Let customers choose a plan and pay online",
            explanation: "Customers can sign up and pay without waiting for you.",
          },
          {
            label: "Let customers sign up and manage their hosting",
            explanation: "Customers can manage their service after signing up.",
          },
        ],
        avoid: [
          "asking about a control panel",
          "presenting AI suggestions as if the user selected them",
        ],
      },
    ],
    completionCriteria: [
      "The question asks about customer outcomes, not hosting terminology.",
      "The explanation says what this decision determines and how it can change the work, without generic filler.",
      "The summary addresses the reader naturally or describes the task neutrally without assuming who benefits.",
      "A few plain-language options include brief explanations, while a custom answer remains possible.",
      "Only the option the user selects is recorded as their answer.",
    ],
  },
  {
    id: "plain-language-home-repair",
    profile: "A renter with little construction knowledge who knows the symptoms and urgency.",
    request:
      "The ceiling in my bedroom has a wet patch and I need it fixed before my family visits next weekend.",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Capture the visible ceiling damage and requested repair, while distinguishing the unknown cause from the desired outcome.",
        avoid: [
          "diagnosing a roof leak as fact",
          "specifying drywall or plumbing work without evidence",
        ],
        expectedFamiliarity: "unknown",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question:
          "Is the patch still getting wet, or has the source of the water already been stopped?",
        impact: "constraint",
        userReply: "It gets damp again when it rains. I don't know where the water comes from.",
        avoid: ["asking the user to identify the building material", "asking for a repair method"],
      },
      {
        type: "clarify",
        question:
          "Roughly how large is the wet area, and are there any signs of water near lights or electrical outlets?",
        impact: "scale",
        userReply: "About the size of a dinner plate, not near a light or outlet.",
        avoid: [
          "assuming the repair is only cosmetic",
          "asking for a contractor's technical diagnosis",
        ],
      },
      {
        type: "confirm_budget",
        userReply: "I need to find out what it will cost first.",
        expectedState: "undecided",
      },
    ],
    completionCriteria: [
      "The intake asks about ongoing water and approximate repair scale because they can change urgency and work scope.",
      "It does not assert a cause or ask the user to choose a repair technique.",
      "It keeps budget undecided rather than fabricating a ceiling.",
    ],
  },
  {
    id: "existing-report-correction",
    profile: "A nontechnical nonprofit director who corrects a mistaken interpretation.",
    request: "Can someone help with our annual report?",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Ask whether the user needs writing, editing, design, or another kind of help; do not assume the deliverable.",
        avoid: [
          "assuming a new report must be written",
          "asking for software or file format first",
        ],
        expectedFamiliarity: "unknown",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question:
          "What kind of help would be most useful: drafting, editing an existing report, or preparing its layout?",
        impact: "deliverable",
        userReply: "Editing. We already have a draft and only need clearer wording.",
        avoid: ["asking for a complete rewrite", "adding layout or branding work"],
      },
      {
        type: "clarify",
        question:
          "About how long is the draft, and is there a date when the edited version is needed?",
        impact: "scale",
        userReply: "It's 18 pages and needed in three weeks.",
        avoid: [
          "asking for a word-processing application choice",
          "asking for font or color preferences",
        ],
      },
      {
        type: "confirm_budget",
        userReply: "We can spend up to USD 700.",
        expectedState: "ceiling",
      },
      {
        type: "approve",
        userReply: "Correct. Please don't change our facts or add new claims.",
        mustPreserve: [
          "Edit existing 18-page draft",
          "Improve wording without changing facts or adding claims",
          "Due in three weeks",
          "USD 700 is a ceiling",
        ],
      },
    ],
    completionCriteria: [
      "The clarified task is editing, not writing from scratch.",
      "The correction and explicit factual boundary are preserved.",
      "Page count, deadline, and ceiling are retained as price-relevant scope facts.",
    ],
  },
  {
    id: "scale-controls-price",
    profile: "A small-business owner who describes the business outcome but not workload scale.",
    request: "I need help entering our product listings into an online shop.",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Identify product listing entry as the intended work and ask about volume before proposing a quote or professional-ready scope.",
        avoid: [
          "assuming a product count",
          "asking which commerce platform if the existing one can be identified later",
        ],
        expectedFamiliarity: "unknown",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question:
          "About how many products need to be entered, and do you already have their names, prices, and photos?",
        impact: "scale",
        userReply:
          "About 600. We have names and prices in a spreadsheet, but photos are in several folders.",
        avoid: [
          "asking the user to design a data-import schema",
          "treating missing photos as an agreed task",
        ],
      },
      {
        type: "clarify",
        question:
          "Should the work include matching each product with a photo, or only entering listings and leaving unmatched photos out?",
        impact: "deliverable",
        userReply: "Match photos when possible and flag any product that has no clear photo.",
        avoid: ["choosing an image recognition vendor", "adding photo editing without approval"],
      },
      {
        type: "confirm_budget",
        userReply: "We have not decided on a budget.",
        expectedState: "undecided",
      },
    ],
    completionCriteria: [
      "The system asks about listing volume and materials because they materially affect effort.",
      "It distinguishes an approved photo-matching deliverable from unapproved editing.",
      "It avoids premature platform implementation choices.",
    ],
  },
  {
    id: "experienced-user-prefers-technical-language",
    profile:
      "A web professional who states task-specific experience and requests technical terminology.",
    request:
      "I'm a front-end developer. Our existing Next.js booking flow loses the selected time zone between checkout steps. Please use technical terms; I want a minimal diagnosis and fix, not a redesign.",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Recognize the user's stated front-end and Next.js familiarity for this task, preserve the narrow debugging scope, and communicate technically without choosing a solution prematurely.",
        avoid: [
          "explaining what Next.js is",
          "assuming the user wants a redesign",
          "inferring backend ownership",
        ],
        expectedFamiliarity: "experienced",
        expectedStyle: "technical",
      },
      {
        type: "clarify",
        question:
          "At which checkout transition is the time zone first lost, and can you reproduce it consistently?",
        impact: "objective",
        userReply:
          "It disappears after the user returns from the payment provider. It reproduces on every Safari test.",
        avoid: ["asking what a time zone is", "asking the user to choose a framework"],
      },
      {
        type: "clarify",
        question:
          "Is the fix limited to preserving the selected time zone, or should the related checkout state also be audited?",
        impact: "deliverable",
        userReply: "Only preserve the time zone. Keep the scope to diagnosis and that fix.",
        avoid: ["expanding to a broad checkout refactor", "redesigning the booking flow"],
      },
    ],
    completionCriteria: [
      "The communication style reflects explicit, task-specific experience and user preference.",
      "Technical familiarity does not authorize expanding the requested work.",
      "The minimal diagnosis-and-fix scope remains explicit.",
    ],
  },
  {
    id: "typos-do-not-imply-inexperience",
    profile:
      "A requester with typos and informal writing but no direct statement of task familiarity.",
    request:
      "need 120 chairs reupholstered for our cafe, stain resistant if poss. keep old wood legs n dont change the shape",
    actions: [
      {
        type: "interpret",
        assistantIntent:
          "Preserve the quantity, stain-resistant preference, original legs, and shape constraint; do not infer professional familiarity from informal spelling.",
        avoid: [
          "treating typos as evidence of low competence",
          "asking the user to name fabric types",
        ],
        expectedFamiliarity: "unknown",
        expectedStyle: "plain_language",
      },
      {
        type: "clarify",
        question:
          "Do all 120 chairs need the same fabric, and will the chairs be available together or in groups?",
        impact: "scale",
        userReply: "The same fabric for all of them. We can provide 30 chairs at a time.",
        avoid: ["correcting the user's grammar", "requiring fabric-industry terminology"],
      },
    ],
    completionCriteria: [
      "Typos, spelling, and informal grammar are not used to assign a familiarity level.",
      "The system asks about batch size because it can affect scheduling and cost.",
      "The system does not ask for aesthetic or technical fabric specifications prematurely.",
    ],
  },
];
