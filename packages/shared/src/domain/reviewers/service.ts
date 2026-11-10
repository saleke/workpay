import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { users } from "../../db/schema/identity.js";
import { providerPaypalAccounts } from "../../db/schema/paypal.js";
import { providers } from "../../db/schema/providers.js";
import { tasks, workSpecifications } from "../../db/schema/tasks.js";
import { authorizationError, notFound, validationError } from "../../platform/errors.js";
import {
  getConfiguredNewPaymentMode,
  paymentModeEnvironment,
} from "../../integrations/payments/config.js";
import { extractPlanSnapshot } from "../contracts/plan-snapshot.js";
import {
  normalizeReviewerDomain,
  recommendReviewers,
  type ReviewerCandidate,
} from "./recommendation.js";
import { readStoredReviewService } from "./work-profile.js";

export async function getTaskReviewerRecommendations(
  db: Database,
  input: { taskId: string; userId: string; additionalDomains?: string[] },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
  if (!task) throw notFound("Task");
  if (task.userId !== input.userId) throw authorizationError();
  const [buyer] = await db
    .select({ accountClass: users.accountClass })
    .from(users)
    .where(eq(users.id, task.userId))
    .limit(1);
  if (!buyer || buyer.accountClass === "UNCLASSIFIED") {
    throw validationError("The buyer account must be classified before reviewer discovery.");
  }

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
      reason: "Approve the task agreement before looking for a reviewer.",
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
          ? "Choose the domain or domains this review should cover."
          : "Add at least one review domain.",
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

  const professionalProfiles = await db
    .select({
      providerId: providers.id,
      userId: providers.userId,
      displayName: providers.displayName,
      workPreferences: providers.workPreferences,
      username: users.username,
    })
    .from(providers)
    .innerJoin(users, eq(users.id, providers.userId))
    .where(and(eq(providers.status, "ACTIVE"), eq(users.accountClass, buyer.accountClass)));
  const paypalAccounts =
    buyer.accountClass === "MEMBER" && professionalProfiles.length > 0
      ? await db
          .select()
          .from(providerPaypalAccounts)
          .where(
            and(
              inArray(
                providerPaypalAccounts.providerId,
                professionalProfiles.map((profile) => profile.providerId),
              ),
              eq(
                providerPaypalAccounts.environment,
                paymentModeEnvironment(getConfiguredNewPaymentMode()),
              ),
              eq(providerPaypalAccounts.status, "ACTIVE"),
            ),
          )
      : [];
  const candidates: ReviewerCandidate[] = professionalProfiles.flatMap((profile) => {
    if (!profile.userId) return [];
    const reviewService = readStoredReviewService(profile.workPreferences);
    if (
      !reviewService?.enabled ||
      !reviewService.listed ||
      reviewService.availability !== "AVAILABLE" ||
      !reviewService.conflictDisclosureConfirmed ||
      !reviewService.domains.some((domain) => requiredDomains.includes(domain.domainTag))
    ) {
      return [];
    }
    const workPreferences = profile.workPreferences as Record<string, unknown> | null;
    const paypalAccount = paypalAccounts.find(
      (account) => account.providerId === profile.providerId,
    );
    const paymentReady =
      reviewService.feeMode === "DIRECT" ||
      buyer.accountClass === "DEMO_FIXTURE" ||
      Boolean(
        paypalAccount?.merchantId &&
        paypalAccount.paymentsReceivable &&
        paypalAccount.primaryEmailConfirmed &&
        paypalAccount.consentStatus,
      );
    const languages = Array.isArray(workPreferences?.languages)
      ? workPreferences.languages.filter(
          (language): language is string => typeof language === "string",
        )
      : ["English"];
    return [
      {
        providerId: profile.providerId,
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        publicContactUrl: reviewService.publicContactUrl,
        summary: reviewService.summary,
        feeMinor: reviewService.feeMinor,
        currency: "USD",
        languages,
        typicalTurnaroundDays: reviewService.typicalTurnaroundDays,
        feeMode: reviewService.feeMode,
        paymentReady,
        conflictDisclosureConfirmed: reviewService.conflictDisclosureConfirmed,
        expertise: reviewService.domains,
        evidence: reviewService.evidence.map((item, index) => ({
          id: `${profile.providerId}:review-evidence:${index}`,
          ...item,
        })),
        conflictedUserIds: reviewService.conflictUserIds,
      },
    ];
  });
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
        ? "Reviewers are ordered by overlap with the selected review domains."
        : "No available review service matched the selected domains and disclosed conflicts.",
  };
}
