import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { requireProviderUser } from "@/lib/server/conversation-auth";
import { providers, capabilities, availability } from "@workpay/shared/db/schema/providers";
import { users } from "@workpay/shared/db/schema/identity";
import { newId, validationError } from "@workpay/shared/platform";
import {
  readStoredReviewService,
  reviewServiceInputSchema,
  storeReviewService,
} from "@workpay/shared/domain";

const workPreferencesSchema = z.object({
  workAcceptanceStatus: z.enum(["ACCEPTING", "LIMITED", "UNAVAILABLE"]).default("ACCEPTING"),
  timezone: z.string().default("UTC"),
  availabilitySchedule: z.string().optional().nullable(),
  minNoticeHours: z.number().int().nonnegative().default(4),
  plannedUnavailability: z.string().optional().nullable(),
  pricingModel: z.enum(["FIXED", "HOURLY", "BOTH"]).default("FIXED"),
  targetRateMinor: z.number().int().nonnegative().optional().nullable(),
  minCompensationMinor: z.number().int().nonnegative().optional().nullable(),
  minAssignmentSizeMinor: z.number().int().nonnegative().optional().nullable(),
  willingToNegotiate: z.boolean().default(true),
  acceptedCategories: z.array(z.string()).default([]),
  declinedCategories: z.array(z.string()).default([]),
  requireExplicitApproval: z.boolean().default(true),
  aiRecommendationAllowed: z.boolean().default(true),
  communicationPreference: z.enum(["ASYNC", "REALTIME", "DIRECT"]).default("ASYNC"),
  deliveryFormat: z.string().optional().nullable(),
  updateFrequency: z
    .enum(["CHECKPOINTS_ONLY", "DAILY", "ON_MILESTONES"])
    .default("CHECKPOINTS_ONLY"),
  notifyOnVerificationFail: z.boolean().default(true),
  notifyOnRevisionRequest: z.boolean().default(true),
  reviewSpecBeforeAccept: z.boolean().default(true),
  toolsAndTechnologies: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(["English"]),
  reviewService: reviewServiceInputSchema.optional(),
});

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    bio: z.string().trim().max(500).optional().nullable(),
    hourlyRateMinor: z.number().int().nonnegative().optional().nullable(),
    currency: z.literal("USD").default("USD"),
    payoutEmail: z.string().trim().email().optional().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    capabilities: z
      .array(
        z.object({
          tag: z.string().trim().min(1).max(50),
          proficiency: z.number().int().min(1).max(5).default(4),
        }),
      )
      .default([]),
    availability: z
      .object({
        available: z.boolean().default(true),
        capacity: z.number().int().min(1).max(20).default(2),
      })
      .optional(),
    workPreferences: workPreferencesSchema.optional(),
  })
  .superRefine((profile, context) => {
    if (profile.status === "ACTIVE" && !profile.bio?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bio"],
        message: "Add a professional summary before listing your profile.",
      });
    }
    if (
      profile.status === "ACTIVE" &&
      profile.workPreferences?.workAcceptanceStatus !== "UNAVAILABLE" &&
      profile.workPreferences?.aiRecommendationAllowed !== false &&
      profile.capabilities.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capabilities"],
        message: "Add at least one service before listing your project-work profile.",
      });
    }
  });

const DEFAULT_WORK_PREFERENCES = {
  workAcceptanceStatus: "ACCEPTING" as const,
  timezone: "UTC",
  availabilitySchedule: "Monday to Friday, 9:00 AM - 5:00 PM UTC",
  minNoticeHours: 4,
  plannedUnavailability: null,
  pricingModel: "FIXED" as const,
  targetRateMinor: null,
  minCompensationMinor: null,
  minAssignmentSizeMinor: null,
  willingToNegotiate: true,
  acceptedCategories: [],
  declinedCategories: [],
  requireExplicitApproval: true,
  aiRecommendationAllowed: true,
  communicationPreference: "ASYNC" as const,
  deliveryFormat: null,
  updateFrequency: "CHECKPOINTS_ONLY" as const,
  notifyOnVerificationFail: true,
  notifyOnRevisionRequest: true,
  reviewSpecBeforeAccept: true,
  toolsAndTechnologies: [],
  languages: ["English"],
  reviewService: {
    enabled: false,
    listed: false,
    availability: "AVAILABLE" as const,
    notice: null,
    summary: "",
    publicContactUrl: null,
    feeMinor: null,
    typicalTurnaroundDays: null,
    conflictDisclosureConfirmed: false,
    conflictNotes: null,
    conflictUsernames: [],
    domains: [],
    evidence: [],
    feeMode: "PAYPAL" as const,
  },
};

export async function GET(req: Request) {
  try {
    const actor = await requireProviderUser(req);
    const db = getDb();

    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, actor.id as string))
      .limit(1);

    if (!provider) {
      const [account] = await db
        .select({ name: users.name, displayName: users.displayName, image: users.image })
        .from(users)
        .where(eq(users.id, actor.id))
        .limit(1);
      return jsonOk({
        isListed: false,
        provider: null,
        profile: {
          displayName: account?.displayName || account?.name || "",
          image: account?.image ?? null,
        },
      });
    }

    const [[account], caps, [avail]] = await Promise.all([
      db.select({ image: users.image }).from(users).where(eq(users.id, actor.id)).limit(1),
      db
        .select({
          tag: capabilities.tag,
          proficiency: capabilities.proficiency,
        })
        .from(capabilities)
        .where(eq(capabilities.providerId, provider.id)),
      db.select().from(availability).where(eq(availability.providerId, provider.id)).limit(1),
    ]);

    const savedPrefs = (provider.workPreferences as Record<string, unknown> | null) ?? null;
    const reviewService = readStoredReviewService(savedPrefs);
    const conflictRows = reviewService?.conflictUserIds.length
      ? await db
          .select({ username: users.username })
          .from(users)
          .where(inArray(users.id, reviewService.conflictUserIds))
      : [];
    const publicReviewService = reviewService
      ? {
          ...reviewService,
          conflictUsernames: conflictRows.flatMap((row) => (row.username ? [row.username] : [])),
          conflictUserIds: undefined,
        }
      : DEFAULT_WORK_PREFERENCES.reviewService;

    return jsonOk({
      isListed: true,
      provider: {
        id: provider.id,
        userId: provider.userId,
        displayName: provider.displayName,
        image: account?.image ?? null,
        bio: provider.bio,
        hourlyRateMinor: provider.hourlyRateMinor,
        currency: provider.currency,
        payoutEmail: provider.payoutEmail,
        status: provider.status,
        capabilities: caps,
        availability: {
          available: avail?.available ?? true,
          capacity: avail?.capacity ?? 2,
          activeAssignments: avail?.activeAssignments ?? 0,
        },
        workPreferences: {
          ...DEFAULT_WORK_PREFERENCES,
          ...(savedPrefs ?? {}),
          reviewService: publicReviewService,
        },
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireProviderUser(req);
    const body = await req.json();
    const parsed = updateProfileSchema.parse(body);
    const reviewServiceInput = parsed.workPreferences?.reviewService;
    const conflictUsernames = [
      ...new Set(
        (reviewServiceInput?.conflictUsernames ?? []).map((username) => username.toLowerCase()),
      ),
    ];
    const conflictedUsers = conflictUsernames.length
      ? await getDb()
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, conflictUsernames))
      : [];
    const foundUsernames = new Set(
      conflictedUsers.flatMap((user) => (user.username ? [user.username.toLowerCase()] : [])),
    );
    const missingConflicts = conflictUsernames.filter((username) => !foundUsernames.has(username));
    if (missingConflicts.length > 0) {
      throw validationError("One or more conflict usernames could not be found.", {
        usernames: missingConflicts,
      });
    }

    const result = await withTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(providers)
        .where(eq(providers.userId, actor.id as string))
        .limit(1);

      let providerId: string;
      const storedWorkPreferences = parsed.workPreferences
        ? {
            ...parsed.workPreferences,
            ...(reviewServiceInput
              ? {
                  reviewService: storeReviewService(
                    reviewServiceInput,
                    conflictedUsers.map((user) => user.id).filter((userId) => userId !== actor.id),
                  ),
                }
              : {}),
          }
        : undefined;

      if (existing) {
        providerId = existing.id;
        await tx
          .update(providers)
          .set({
            displayName: parsed.displayName,
            bio: parsed.bio ?? null,
            hourlyRateMinor: parsed.hourlyRateMinor ?? null,
            currency: parsed.currency,
            payoutEmail: parsed.payoutEmail ?? null,
            status: parsed.status,
            workPreferences: storedWorkPreferences ?? existing.workPreferences,
            updatedAt: new Date(),
          })
          .where(eq(providers.id, providerId));
      } else {
        providerId = newId("provider");
        await tx.insert(providers).values({
          id: providerId,
          userId: actor.id as string,
          displayName: parsed.displayName,
          type: "HUMAN",
          status: parsed.status,
          bio: parsed.bio ?? null,
          hourlyRateMinor: parsed.hourlyRateMinor ?? null,
          currency: parsed.currency,
          payoutEmail: parsed.payoutEmail ?? null,
          workPreferences: storedWorkPreferences ?? DEFAULT_WORK_PREFERENCES,
        });
      }

      await tx.delete(capabilities).where(eq(capabilities.providerId, providerId));

      if (parsed.capabilities.length > 0) {
        await tx.insert(capabilities).values(
          parsed.capabilities.map((c) => ({
            id: newId("cap"),
            providerId,
            tag: c.tag.toLowerCase(),
            proficiency: c.proficiency,
          })),
        );
      }

      // Update or insert availability
      const isAvailable = parsed.workPreferences
        ? parsed.workPreferences.workAcceptanceStatus !== "UNAVAILABLE"
        : (parsed.availability?.available ?? true);
      const capacityVal = parsed.availability?.capacity ?? 2;

      const [existingAvail] = await tx
        .select()
        .from(availability)
        .where(eq(availability.providerId, providerId))
        .limit(1);

      let activeAssignmentsCount = 0;
      if (existingAvail) {
        activeAssignmentsCount = existingAvail.activeAssignments;
        await tx
          .update(availability)
          .set({
            available: isAvailable,
            capacity: capacityVal,
            updatedAt: new Date(),
          })
          .where(eq(availability.id, existingAvail.id));
      } else {
        await tx.insert(availability).values({
          id: newId("avail"),
          providerId,
          available: isAvailable,
          capacity: capacityVal,
          activeAssignments: 0,
        });
      }

      return {
        id: providerId,
        userId: actor.id as string,
        displayName: parsed.displayName,
        bio: parsed.bio ?? null,
        hourlyRateMinor: parsed.hourlyRateMinor ?? null,
        currency: parsed.currency,
        payoutEmail: parsed.payoutEmail ?? null,
        status: parsed.status,
        capabilities: parsed.capabilities,
        availability: {
          available: isAvailable,
          capacity: capacityVal,
          activeAssignments: activeAssignmentsCount,
        },
        workPreferences: parsed.workPreferences ?? DEFAULT_WORK_PREFERENCES,
      };
    });

    const [account] = await getDb()
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, actor.id as string))
      .limit(1);

    return jsonOk({
      isListed: true,
      provider: { ...result, image: account?.image ?? null },
    });
  } catch (err) {
    return jsonError(err);
  }
}
