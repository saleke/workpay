import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../../db/client.js";
import {
  reviewerConflicts,
  reviewerEvidence,
  reviewerExpertise,
  reviewerProfiles,
} from "../../db/schema/reviewers.js";
import { workContracts } from "../../db/schema/contracts.js";
import { providers } from "../../db/schema/providers.js";
import { workExecutions } from "../../db/schema/execution.js";
import { tasks, workSpecifications } from "../../db/schema/tasks.js";
import { users } from "../../db/schema/identity.js";
import { authorizationError, notFound, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import { extractPlanSnapshot } from "../contracts/plan-snapshot.js";
import {
  normalizeReviewerDomain,
  recommendReviewers,
  type ReviewerCandidate,
} from "./recommendation.js";

const expertiseInputSchema = z.object({
  domainTag: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _./-]*$/),
  scope: z.string().trim().min(10).max(500),
  selfAssessedLevel: z.number().int().min(1).max(5),
  yearsExperience: z.number().int().min(0).max(80).nullable(),
  methods: z.array(z.string().trim().min(2).max(100)).max(10),
});

const evidenceInputSchema = z.object({
  kind: z.enum(["PORTFOLIO", "CREDENTIAL", "EXPERIENCE", "REFERENCE"]),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(500),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Evidence links must use HTTPS")
    .nullable(),
  issuer: z.string().trim().max(160).nullable(),
});

export const reviewerProfileInputSchema = z
  .object({
    isListed: z.boolean(),
    available: z.boolean(),
    displayName: z.string().trim().min(2).max(100),
    publicContactUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:", "Contact links must use HTTPS")
      .nullable(),
    summary: z.string().trim().min(20).max(1200),
    languages: z.array(z.string().trim().min(2).max(60)).min(1).max(10),
    feeMinor: z.number().int().nonnegative().safe().nullable(),
    typicalTurnaroundDays: z.number().int().min(1).max(365).nullable(),
    conflictDisclosureConfirmed: z.boolean(),
    conflictUsernames: z.array(z.string().trim().min(1).max(32)).max(50),
    expertise: z.array(expertiseInputSchema).min(1).max(20),
    evidence: z.array(evidenceInputSchema).max(20),
  })
  .superRefine((value, context) => {
    const tags = value.expertise.map((item) => normalizeReviewerDomain(item.domainTag));
    if (new Set(tags).size !== tags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expertise"],
        message: "Each review domain must appear only once.",
      });
    }
    if (value.isListed && !value.conflictDisclosureConfirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conflictDisclosureConfirmed"],
        message: "Confirm the conflict-disclosure commitment before listing.",
      });
    }
  });

export type ReviewerProfileInput = z.infer<typeof reviewerProfileInputSchema>;

export async function getReviewerProfile(db: Database, userId: string) {
  const [profile] = await db
    .select()
    .from(reviewerProfiles)
    .where(eq(reviewerProfiles.userId, userId))
    .limit(1);
  if (!profile) return null;

  const [expertise, evidence, conflicts] = await Promise.all([
    db.select().from(reviewerExpertise).where(eq(reviewerExpertise.profileId, profile.id)),
    db.select().from(reviewerEvidence).where(eq(reviewerEvidence.profileId, profile.id)),
    db
      .select({ username: users.username, displayName: users.displayName, name: users.name })
      .from(reviewerConflicts)
      .innerJoin(users, eq(users.id, reviewerConflicts.conflictedUserId))
      .where(eq(reviewerConflicts.profileId, profile.id)),
  ]);

  return {
    ...profile,
    expertise: expertise.map(
      ({ id: _id, profileId: _profileId, createdAt: _createdAt, ...item }) => item,
    ),
    evidence: evidence.map(
      ({ id: _id, profileId: _profileId, createdAt: _createdAt, provenance, ...item }) => ({
        ...item,
        provenance,
      }),
    ),
    conflicts: conflicts.map((item) => ({
      username: item.username,
      displayName: item.displayName ?? item.name,
    })),
  };
}

export async function saveReviewerProfile(
  db: Database,
  userId: string,
  input: ReviewerProfileInput,
) {
  const usernames = [...new Set(input.conflictUsernames.map((name) => name.toLowerCase()))];
  const conflictedUsers =
    usernames.length > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, usernames))
      : [];
  const matchedUsernames = new Set(
    conflictedUsers.map((user) => user.username?.toLowerCase()).filter(Boolean),
  );
  const missing = usernames.filter((username) => !matchedUsernames.has(username));
  if (missing.length > 0) {
    throw validationError("One or more conflict usernames could not be found.", {
      usernames: missing,
    });
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(reviewerProfiles)
      .where(eq(reviewerProfiles.userId, userId))
      .limit(1);
    const profileId = existing?.id ?? newId("reviewer");
    const values = {
      userId,
      isListed: input.isListed,
      available: input.available,
      displayName: input.displayName,
      publicContactUrl: input.publicContactUrl,
      summary: input.summary,
      languages: [...new Set(input.languages)],
      feeMinor: input.feeMinor,
      currency: "USD",
      typicalTurnaroundDays: input.typicalTurnaroundDays,
      conflictDisclosureConfirmed: input.conflictDisclosureConfirmed,
      updatedAt: new Date(),
    };

    if (existing) {
      await tx.update(reviewerProfiles).set(values).where(eq(reviewerProfiles.id, profileId));
    } else {
      await tx.insert(reviewerProfiles).values({ id: profileId, ...values });
    }

    await tx.delete(reviewerExpertise).where(eq(reviewerExpertise.profileId, profileId));
    await tx.delete(reviewerEvidence).where(eq(reviewerEvidence.profileId, profileId));
    await tx.delete(reviewerConflicts).where(eq(reviewerConflicts.profileId, profileId));

    if (input.expertise.length > 0) {
      await tx.insert(reviewerExpertise).values(
        input.expertise.map((item) => ({
          id: newId("rex"),
          profileId,
          domainTag: normalizeReviewerDomain(item.domainTag),
          scope: item.scope,
          selfAssessedLevel: item.selfAssessedLevel,
          yearsExperience: item.yearsExperience,
          methods: [...new Set(item.methods)],
        })),
      );
    }
    if (input.evidence.length > 0) {
      await tx.insert(reviewerEvidence).values(
        input.evidence.map((item) => ({
          id: newId("revd"),
          profileId,
          kind: item.kind,
          title: item.title,
          description: item.description,
          url: item.url,
          issuer: item.issuer,
          provenance: "REVIEWER_SUPPLIED",
        })),
      );
    }
    if (conflictedUsers.length > 0) {
      await tx.insert(reviewerConflicts).values(
        conflictedUsers
          .filter((user) => user.id !== userId)
          .map((user) => ({
            id: newId("rconf"),
            profileId,
            conflictedUserId: user.id,
          })),
      );
    }
  });
  const savedProfile = await getReviewerProfile(db, userId);
  if (!savedProfile) throw new Error("Reviewer profile was not available after saving.");
  return savedProfile;
}

export async function getTaskReviewerRecommendations(
  db: Database,
  input: { taskId: string; userId: string; additionalDomains?: string[] },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task) throw notFound("Task");
  if (task.userId !== input.userId) throw authorizationError();

  const [contract] = await db
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.taskId, task.id), eq(workContracts.status, "ACTIVE")))
    .orderBy(desc(workContracts.version))
    .limit(1);
  if (!contract) {
    return {
      contractVersion: null,
      suggestedDomains: [],
      requiredDomains: [],
      recommendations: [],
      reason:
        "Approve a contract with defined review domains before requesting task-specific reviewer recommendations.",
    };
  }

  const [specification] = await db
    .select()
    .from(workSpecifications)
    .where(
      and(
        eq(workSpecifications.taskId, task.id),
        lte(workSpecifications.createdAt, contract.createdAt),
      ),
    )
    .orderBy(desc(workSpecifications.version))
    .limit(1);
  const plan = specification ? extractPlanSnapshot(specification) : null;
  const suggestedDomains = [
    ...new Set((plan?.capabilityTags ?? []).map(normalizeReviewerDomain).filter(Boolean)),
  ];
  const requiredDomains = [
    ...new Set((input.additionalDomains ?? []).map(normalizeReviewerDomain).filter(Boolean)),
  ];
  if (requiredDomains.length === 0) {
    return {
      contractVersion: contract.version,
      suggestedDomains,
      requiredDomains: [],
      recommendations: [],
      reason:
        suggestedDomains.length > 0
          ? "Choose which suggested domain(s) a reviewer should assess. Suggestions are not binding task requirements."
          : "Add a domain the reviewer should assess. WorkPay will not infer one from free-text task details.",
    };
  }

  const [execution] = await db
    .select({ providerId: workExecutions.providerId })
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .limit(1);
  const [performer] = execution?.providerId
    ? await db
        .select({ userId: providers.userId })
        .from(providers)
        .where(eq(providers.id, execution.providerId))
        .limit(1)
    : [];
  const excludedUserIds = new Set(
    [task.userId, performer?.userId ?? null].filter((value): value is string => value !== null),
  );

  const matchingExpertiseRows = await db
    .select({ profileId: reviewerExpertise.profileId })
    .from(reviewerExpertise)
    .where(inArray(reviewerExpertise.domainTag, requiredDomains));
  const matchingProfileIds = [...new Set(matchingExpertiseRows.map((row) => row.profileId))];
  if (matchingProfileIds.length === 0) {
    return {
      contractVersion: contract.version,
      suggestedDomains,
      requiredDomains,
      recommendations: [],
      reason: "No reviewer profiles list the selected domains.",
    };
  }

  const profiles = await db
    .select({
      profileId: reviewerProfiles.id,
      userId: reviewerProfiles.userId,
      displayName: reviewerProfiles.displayName,
      publicContactUrl: reviewerProfiles.publicContactUrl,
      summary: reviewerProfiles.summary,
      feeMinor: reviewerProfiles.feeMinor,
      currency: reviewerProfiles.currency,
      languages: reviewerProfiles.languages,
      typicalTurnaroundDays: reviewerProfiles.typicalTurnaroundDays,
      conflictDisclosureConfirmed: reviewerProfiles.conflictDisclosureConfirmed,
      username: users.username,
    })
    .from(reviewerProfiles)
    .innerJoin(users, eq(users.id, reviewerProfiles.userId))
    .where(
      and(
        eq(reviewerProfiles.isListed, true),
        eq(reviewerProfiles.available, true),
        inArray(reviewerProfiles.id, matchingProfileIds),
      ),
    );
  const profileIds = profiles.map((profile) => profile.profileId);
  if (profileIds.length === 0) {
    return {
      contractVersion: contract.version,
      suggestedDomains,
      requiredDomains,
      recommendations: [],
      reason: "No reviewers are currently listed for independent review.",
    };
  }

  const [expertiseRows, evidenceRows, conflicts] = await Promise.all([
    db.select().from(reviewerExpertise).where(inArray(reviewerExpertise.profileId, profileIds)),
    db.select().from(reviewerEvidence).where(inArray(reviewerEvidence.profileId, profileIds)),
    excludedUserIds.size > 0
      ? db
          .select({
            profileId: reviewerConflicts.profileId,
            conflictedUserId: reviewerConflicts.conflictedUserId,
          })
          .from(reviewerConflicts)
          .where(inArray(reviewerConflicts.conflictedUserId, [...excludedUserIds]))
      : Promise.resolve([]),
  ]);

  const expertiseByProfile = groupBy(expertiseRows, (row) => row.profileId);
  const evidenceByProfile = groupBy(evidenceRows, (row) => row.profileId);
  const conflictsByProfile = groupBy(conflicts, (row) => row.profileId);
  const candidates: ReviewerCandidate[] = profiles.map((profile) => ({
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    publicContactUrl: profile.publicContactUrl,
    summary: profile.summary,
    feeMinor: profile.feeMinor,
    currency: profile.currency,
    languages: profile.languages,
    typicalTurnaroundDays: profile.typicalTurnaroundDays,
    conflictDisclosureConfirmed: profile.conflictDisclosureConfirmed,
    expertise: (expertiseByProfile.get(profile.profileId) ?? []).map((row) => ({
      domainTag: row.domainTag,
      scope: row.scope,
      selfAssessedLevel: row.selfAssessedLevel,
      yearsExperience: row.yearsExperience,
      methods: row.methods,
    })),
    evidence: (evidenceByProfile.get(profile.profileId) ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      url: row.url,
      issuer: row.issuer,
    })),
    conflictedUserIds: (conflictsByProfile.get(profile.profileId) ?? []).map(
      (row) => row.conflictedUserId,
    ),
  }));
  const recommendations = recommendReviewers({
    requiredDomains,
    candidates,
    excludeUserIds: [...excludedUserIds],
  });

  return {
    contractVersion: contract.version,
    suggestedDomains,
    requiredDomains,
    recommendations: recommendations.map(({ selectionScore: _selectionScore, ...item }) => item),
    reason:
      recommendations.length > 0
        ? "Recommendations are based on listed domain overlap and reviewer-supplied profile evidence, not an assessment of review quality."
        : "No available reviewer profile matched the requested domains and disclosed conflicts.",
  };
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}
