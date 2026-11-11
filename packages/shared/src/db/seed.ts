import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { getDb, closeDb, type Database } from "./client.js";
import { users } from "./schema/identity.js";
import { availability, capabilities, providers, reputation } from "./schema/providers.js";
import { logger } from "../platform/logger.js";
import { newId } from "../platform/ids.js";
import { hashPassword } from "../platform/password.js";

export interface SeedResult {
  buyerId: string;
  providerUserId: string;
  reviewerId: string;
  providerIds: string[];
}

const BUYER_ID = "usr_buyer_alice";
const PROVIDER_USER_ID = "usr_provider_bob";
const REVIEWER_ID = "usr_admin_carol";

const demoAccounts = [
  {
    id: BUYER_ID,
    name: "Maya Chen",
    username: "maya_chen",
    email: "maya@demo.tenfo.test",
    role: "buyer" as const,
  },
  {
    id: PROVIDER_USER_ID,
    name: "Jordan Ellis",
    username: "jordan_ellis",
    email: "jordan@demo.tenfo.test",
    role: "provider" as const,
  },
  {
    id: REVIEWER_ID,
    name: "Nadia Patel",
    username: "nadia_patel",
    email: "nadia@demo.tenfo.test",
    role: "admin_reviewer" as const,
  },
  {
    id: "usr_demo_amara",
    name: "Amara Okafor",
    username: "amara_okafor",
    email: "amara@demo.tenfo.test",
    role: "provider" as const,
  },
  {
    id: "usr_demo_lucas",
    name: "Lucas Martin",
    username: "lucas_martin",
    email: "lucas@demo.tenfo.test",
    role: "provider" as const,
  },
  {
    id: "usr_demo_sofia",
    name: "Sofia Reyes",
    username: "sofia_reyes",
    email: "sofia@demo.tenfo.test",
    role: "provider" as const,
  },
  {
    id: "usr_demo_ethan",
    name: "Ethan Brooks",
    username: "ethan_brooks",
    email: "ethan@demo.tenfo.test",
    role: "provider" as const,
  },
];

type ReviewService = {
  enabled: boolean;
  listed: boolean;
  availability: "AVAILABLE" | "BUSY" | "OFFLINE";
  notice: string | null;
  summary: string;
  publicContactUrl: null;
  feeMinor: number | null;
  typicalTurnaroundDays: number | null;
  conflictDisclosureConfirmed: boolean;
  conflictUserIds: string[];
  domains: Array<{
    domainTag: string;
    scope: string;
    selfAssessedLevel: number;
    yearsExperience: number | null;
    methods: string[];
  }>;
  evidence: Array<{
    kind: "EXPERIENCE";
    title: string;
    description: string;
    url: null;
    issuer: null;
  }>;
  feeMode: "DIRECT";
};

const disabledReviewService: ReviewService = {
  enabled: false,
  listed: false,
  availability: "OFFLINE",
  notice: null,
  summary: "",
  publicContactUrl: null,
  feeMinor: null,
  typicalTurnaroundDays: null,
  conflictDisclosureConfirmed: false,
  conflictUserIds: [],
  domains: [],
  evidence: [],
  feeMode: "DIRECT",
};

const providerSpecs = [
  {
    id: "pro_demo_jordan",
    userId: PROVIDER_USER_ID,
    displayName: "Jordan Ellis",
    bio: "I help teams turn inconsistent spreadsheets and operational data into dependable, documented datasets and reports.",
    hourlyRateMinor: 6500,
    services: ["data-cleaning", "spreadsheet-automation", "data-validation", "reporting"],
    tools: ["Python", "SQL", "Excel", "Google Sheets", "Pandas"],
    acceptedCategories: ["data operations", "reporting", "spreadsheet workflows"],
    deliveryFormat: "A clean working dataset, change summary, and practical handover notes.",
    timezone: "Europe/London (GMT)",
    schedule: "Monday to Friday, 9:00 AM to 5:00 PM GMT",
    capacity: 3,
    reviewService: disabledReviewService,
  },
  {
    id: "pro_demo_amara",
    userId: "usr_demo_amara",
    displayName: "Amara Okafor",
    bio: "I create clear visual identities, presentation systems, and campaign assets for growing products and organizations.",
    hourlyRateMinor: 6000,
    services: ["brand-identity", "presentation-design", "social-media-design", "visual-design"],
    tools: ["Figma", "Adobe Illustrator", "Adobe Photoshop", "Canva"],
    acceptedCategories: ["brand design", "presentations", "marketing design"],
    deliveryFormat: "Editable source files, export-ready assets, and a concise usage guide.",
    timezone: "UTC",
    schedule: "Monday to Friday, 8:00 AM to 4:00 PM UTC",
    capacity: 2,
    reviewService: disabledReviewService,
  },
  {
    id: "pro_demo_lucas",
    userId: "usr_demo_lucas",
    displayName: "Lucas Martin",
    bio: "I organize bookkeeping records, reconcile accounts, and prepare straightforward financial summaries for small teams.",
    hourlyRateMinor: 5500,
    services: [
      "bookkeeping",
      "account-reconciliation",
      "financial-reporting",
      "spreadsheet-cleanup",
    ],
    tools: ["QuickBooks", "Xero", "Excel", "Google Sheets"],
    acceptedCategories: ["bookkeeping", "reconciliation", "financial operations"],
    deliveryFormat: "Reconciled records, exception notes, and an easy-to-review financial summary.",
    timezone: "America/New_York (ET)",
    schedule: "Monday to Friday, 9:00 AM to 5:00 PM ET",
    capacity: 2,
    reviewService: disabledReviewService,
  },
  {
    id: "pro_demo_sofia",
    userId: "usr_demo_sofia",
    displayName: "Sofia Reyes",
    bio: "I review digital products for accessibility and usability, then turn findings into prioritized, practical improvements.",
    hourlyRateMinor: 7000,
    services: ["accessibility-audit", "ux-review", "usability-testing", "web-design"],
    tools: ["Figma", "axe DevTools", "WAVE", "NVDA", "VoiceOver"],
    acceptedCategories: ["accessibility", "user experience", "product review"],
    deliveryFormat:
      "Prioritized findings, evidence, and remediation guidance mapped to the agreed scope.",
    timezone: "Europe/Paris (CET)",
    schedule: "Monday to Friday, 9:00 AM to 5:00 PM CET",
    capacity: 2,
    reviewService: {
      enabled: true,
      listed: true,
      availability: "AVAILABLE",
      notice: null,
      summary: "Independent accessibility and usability review for digital products.",
      publicContactUrl: null,
      feeMinor: 18000,
      typicalTurnaroundDays: 4,
      conflictDisclosureConfirmed: true,
      conflictUserIds: [],
      domains: [
        {
          domainTag: "accessibility",
          scope:
            "Keyboard access, semantic structure, assistive-technology use, and documented remediation findings.",
          selfAssessedLevel: 4,
          yearsExperience: 6,
          methods: ["evidence review", "manual walkthrough", "written findings"],
        },
        {
          domainTag: "user-experience",
          scope: "Task flow clarity, interaction friction, and usability evidence.",
          selfAssessedLevel: 4,
          yearsExperience: 6,
          methods: ["heuristic review", "task walkthrough", "written findings"],
        },
      ],
      evidence: [
        {
          kind: "EXPERIENCE",
          title: "Evaluator profile experience summary",
          description: "Synthetic experience information provided for testing the review workflow.",
          url: null,
          issuer: null,
        },
      ],
      feeMode: "DIRECT",
    },
  },
  {
    id: "pro_demo_nadia",
    userId: REVIEWER_ID,
    displayName: "Nadia Patel",
    bio: "I provide structured independent reviews of research, content quality, and user-facing project outcomes.",
    hourlyRateMinor: null,
    services: [],
    tools: ["Notion", "Google Docs", "Figma"],
    acceptedCategories: [],
    deliveryFormat:
      "Attributable findings with clear rationale against the agreed review criteria.",
    timezone: "UTC",
    schedule: "Review engagements by agreement",
    capacity: 1,
    reviewService: {
      enabled: true,
      listed: true,
      availability: "AVAILABLE",
      notice: null,
      summary: "Independent review of research, content quality, and user-facing project outcomes.",
      publicContactUrl: null,
      feeMinor: 20000,
      typicalTurnaroundDays: 3,
      conflictDisclosureConfirmed: true,
      conflictUserIds: [],
      domains: [
        {
          domainTag: "content-quality",
          scope: "Clarity, completeness, consistency, and alignment with agreed audience needs.",
          selfAssessedLevel: 4,
          yearsExperience: 7,
          methods: ["evidence review", "criteria mapping", "written findings"],
        },
        {
          domainTag: "research",
          scope: "Research traceability, synthesis quality, and support for stated conclusions.",
          selfAssessedLevel: 4,
          yearsExperience: 7,
          methods: ["source review", "traceability review", "written findings"],
        },
      ],
      evidence: [
        {
          kind: "EXPERIENCE",
          title: "Evaluator profile experience summary",
          description: "Synthetic experience information provided for testing the review workflow.",
          url: null,
          issuer: null,
        },
      ],
      feeMode: "DIRECT",
    },
  },
  {
    id: "pro_demo_ethan",
    userId: "usr_demo_ethan",
    displayName: "Ethan Brooks",
    bio: "I independently review bookkeeping reconciliations, financial summaries, and the evidence behind reported figures.",
    hourlyRateMinor: null,
    services: [],
    tools: ["Excel", "QuickBooks", "Xero"],
    acceptedCategories: [],
    deliveryFormat: "A concise findings report tied to the agreed financial review criteria.",
    timezone: "America/Chicago (CT)",
    schedule: "Review engagements by agreement",
    capacity: 1,
    reviewService: {
      enabled: true,
      listed: true,
      availability: "AVAILABLE",
      notice: null,
      summary:
        "Independent review of reconciliations, financial summaries, and supporting evidence.",
      publicContactUrl: null,
      feeMinor: 22000,
      typicalTurnaroundDays: 4,
      conflictDisclosureConfirmed: true,
      conflictUserIds: [],
      domains: [
        {
          domainTag: "bookkeeping",
          scope:
            "Reconciliation completeness, traceability, and consistency of financial summaries.",
          selfAssessedLevel: 4,
          yearsExperience: 8,
          methods: ["reconciliation review", "source tracing", "written findings"],
        },
        {
          domainTag: "financial-analysis",
          scope: "Consistency of calculations, assumptions, and reported financial conclusions.",
          selfAssessedLevel: 4,
          yearsExperience: 8,
          methods: ["calculation review", "assumption review", "written findings"],
        },
      ],
      evidence: [
        {
          kind: "EXPERIENCE",
          title: "Evaluator profile experience summary",
          description: "Synthetic experience information provided for testing the review workflow.",
          url: null,
          issuer: null,
        },
      ],
      feeMode: "DIRECT",
    },
  },
] as const;

function workPreferences(spec: (typeof providerSpecs)[number]) {
  const acceptingProjectWork = spec.services.length > 0;
  return {
    workAcceptanceStatus: acceptingProjectWork ? ("ACCEPTING" as const) : ("UNAVAILABLE" as const),
    timezone: spec.timezone,
    availabilitySchedule: spec.schedule,
    minNoticeHours: 12,
    plannedUnavailability: null,
    pricingModel: "BOTH" as const,
    targetRateMinor: spec.hourlyRateMinor,
    minCompensationMinor: spec.hourlyRateMinor,
    minAssignmentSizeMinor: spec.hourlyRateMinor,
    willingToNegotiate: true,
    acceptedCategories: [...spec.acceptedCategories],
    declinedCategories: [],
    requireExplicitApproval: true,
    aiRecommendationAllowed: acceptingProjectWork,
    communicationPreference: "ASYNC" as const,
    deliveryFormat: spec.deliveryFormat,
    updateFrequency: "ON_MILESTONES" as const,
    notifyOnVerificationFail: true,
    notifyOnRevisionRequest: true,
    reviewSpecBeforeAccept: true,
    toolsAndTechnologies: [...spec.tools],
    languages: ["English"],
    reviewService: spec.reviewService,
  };
}

export async function seed(db: Database = getDb()): Promise<SeedResult> {
  logger.info("seeding fresh Tenfo evaluator identities and Work Profiles");
  const demoPasswordHash = process.env.WORKPAY_DEMO_PASSWORD
    ? hashPassword(process.env.WORKPAY_DEMO_PASSWORD)
    : undefined;
  const verifiedAt = new Date();

  for (const account of demoAccounts) {
    await db
      .insert(users)
      .values({
        ...account,
        displayName: account.name,
        accountClass: "DEMO_FIXTURE",
        emailVerified: verifiedAt,
        ...(demoPasswordHash ? { passwordHash: demoPasswordHash } : {}),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: account.name,
          displayName: account.name,
          username: account.username,
          email: account.email,
          emailVerified: verifiedAt,
          role: account.role,
          accountClass: "DEMO_FIXTURE",
          ...(demoPasswordHash ? { passwordHash: demoPasswordHash } : {}),
          updatedAt: new Date(),
        },
      });
  }

  const seededProviderIds: string[] = [];
  for (const spec of providerSpecs) {
    const preferences = workPreferences(spec);
    const [existingProfile] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.userId, spec.userId))
      .limit(1);
    const providerId = existingProfile?.id ?? spec.id;
    seededProviderIds.push(providerId);
    await db
      .insert(providers)
      .values({
        id: providerId,
        userId: spec.userId,
        displayName: spec.displayName,
        type: "HUMAN",
        status: "ACTIVE",
        bio: spec.bio,
        hourlyRateMinor: spec.hourlyRateMinor,
        currency: "USD",
        payoutEmail: null,
        workPreferences: preferences,
      })
      .onConflictDoUpdate({
        target: providers.id,
        set: {
          userId: spec.userId,
          displayName: spec.displayName,
          status: "ACTIVE",
          bio: spec.bio,
          hourlyRateMinor: spec.hourlyRateMinor,
          payoutEmail: null,
          workPreferences: preferences,
          updatedAt: new Date(),
        },
      });

    await db.delete(capabilities).where(eq(capabilities.providerId, providerId));
    if (spec.services.length > 0) {
      await db.insert(capabilities).values(
        spec.services.map((tag) => ({
          id: newId("cap"),
          providerId,
          tag,
          proficiency: 4,
        })),
      );
    }

    await db
      .insert(availability)
      .values({
        id: newId("avail"),
        providerId,
        available: spec.services.length > 0,
        capacity: spec.capacity,
        activeAssignments: 0,
      })
      .onConflictDoUpdate({
        target: availability.providerId,
        set: {
          available: spec.services.length > 0,
          capacity: spec.capacity,
          activeAssignments: 0,
          updatedAt: new Date(),
        },
      });

    await db.delete(reputation).where(eq(reputation.providerId, providerId));
    await db.insert(reputation).values({
      id: newId("rep"),
      providerId,
      completedTasks: 0,
      onTimeRatePct: null,
      firstPassAcceptancePct: null,
      avgSettlementMinor: null,
    });
  }

  logger.info(
    { demoUsers: demoAccounts.length, workProfiles: providerSpecs.length },
    "fresh Tenfo evaluator seed ready",
  );
  return {
    buyerId: BUYER_ID,
    providerUserId: PROVIDER_USER_ID,
    reviewerId: REVIEWER_ID,
    providerIds: seededProviderIds,
  };
}

async function main(): Promise<void> {
  try {
    await seed();
    await closeDb();
  } catch (error) {
    logger.error({ err: String(error) }, "seed failed");
    await closeDb();
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
