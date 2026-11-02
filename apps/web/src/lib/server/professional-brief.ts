import type { IntakeVersion } from "@workpay/shared/domain/intake";
import {
  getIntakeAIClient,
  INTAKE_PROFESSIONAL_BRIEF_PROMPT_VERSION,
} from "@workpay/shared/integrations/ai";
import { conflict } from "@workpay/shared/platform";

export async function composeProfessionalBriefProposal(version: IntakeVersion) {
  const { interpretation, scopeAssessment } = version;
  if (!interpretation || !scopeAssessment) {
    throw conflict(
      "Confirm the task interpretation and assess its scope before composing a brief.",
    );
  }

  const clarificationSourceIds = new Set(
    version.clarificationAnswers.map(({ sourceId }) => sourceId),
  );
  const budgetClarificationSourceIds = new Set(
    scopeAssessment.budget.evidence
      .map(({ sourceId }) => sourceId)
      .filter((sourceId) => clarificationSourceIds.has(sourceId)),
  );
  const budgetDecisionSourceIds = new Set(version.budget.evidence.map(({ sourceId }) => sourceId));
  const excludedBudgetSourceIds = new Set([
    ...budgetClarificationSourceIds,
    ...budgetDecisionSourceIds,
  ]);
  const sources = version.sources.filter(({ id }) => !excludedBudgetSourceIds.has(id));
  const clarificationAnswers = version.clarificationAnswers
    .filter(({ sourceId }) => !budgetClarificationSourceIds.has(sourceId))
    .map(({ sourceId, question, answer }) => ({ sourceId, question, answer }));

  const client = getIntakeAIClient();
  const proposal = await client.composeProfessionalBrief({
    sources,
    confirmedIntent: interpretation,
    clarificationAnswers,
  });
  return {
    proposal,
    operation: {
      operation: "compose_professional_brief" as const,
      provider: client.name,
      model: client.modelId,
      promptVersion: INTAKE_PROFESSIONAL_BRIEF_PROMPT_VERSION,
      recordedAt: new Date().toISOString(),
    },
  };
}
