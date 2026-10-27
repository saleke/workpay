import { conflict, externalFailure, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import {
  type BudgetMeaning,
  type CommunicationStyle,
  type IntakeAIOperation,
  type IntakeSource,
  type IntakeVersion,
  type IntentInterpretationOutput,
  type ScopeAssessmentOutput,
  validateIntakeVersion,
} from "./model.js";
import { evaluateIntakeReadiness } from "./readiness.js";

function assertEditable(version: IntakeVersion): void {
  if (version.approvedAt !== null) {
    throw conflict("An approved brief is frozen and cannot be edited.");
  }
}

function appendUserSource(
  version: IntakeVersion,
  kind: "user_message" | "user_correction",
  content: string,
): { source: IntakeSource; sources: IntakeSource[] } {
  if (content.trim().length === 0 || content.length > 6_000) {
    throw validationError("The user response is empty or exceeds the supported size.");
  }
  const source = { id: newId("source"), kind, content };
  return { source, sources: [...version.sources, source] };
}

function validateAIProposal<T>(build: () => T): T {
  try {
    return build();
  } catch (cause) {
    throw externalFailure(
      "The AI response could not be safely matched to the user-provided information. Please try again.",
      cause,
    );
  }
}

export function recordIntentInterpretation(
  version: IntakeVersion,
  proposal: IntentInterpretationOutput,
  operation: IntakeAIOperation,
): IntakeVersion {
  assertEditable(version);
  if (version.interpretation !== null) {
    throw conflict("An interpretation already exists. Confirm it or submit a correction first.");
  }
  return validateAIProposal(() =>
    validateIntakeVersion({
      ...version,
      version: version.version + 1,
      aiOperations: [...version.aiOperations, operation],
      interpretation: proposal,
      correctionContext: null,
      scopeAssessment: null,
      factConfirmations: [],
      interpretationConfirmationSourceId: null,
      budget: {
        meaning: { state: "not_provided" },
        evidence: [],
        confirmationSourceId: null,
      },
      unresolvedCriticalUnknownIds: [],
      approvedAt: null,
      approvalSourceId: null,
    }),
  );
}

export function recordInterpretationDecision(
  version: IntakeVersion,
  input: { decision: "confirm" } | { decision: "correct"; correction: string },
): IntakeVersion {
  assertEditable(version);
  if (version.interpretation === null) {
    throw conflict("Interpret the request before confirming or correcting it.");
  }

  if (input.decision === "correct") {
    const { sources } = appendUserSource(version, "user_correction", input.correction);
    return validateIntakeVersion({
      ...version,
      version: version.version + 1,
      sources,
      interpretation: null,
      correctionContext: version.interpretation,
      scopeAssessment: null,
      factConfirmations: [],
      interpretationConfirmationSourceId: null,
      budget: {
        meaning: { state: "not_provided" },
        evidence: [],
        confirmationSourceId: null,
      },
      unresolvedCriticalUnknownIds: [],
      approvedAt: null,
      approvalSourceId: null,
    });
  }

  if (version.interpretationConfirmationSourceId !== null) {
    throw conflict("The interpretation has already been confirmed.");
  }
  const { source, sources } = appendUserSource(
    version,
    "user_message",
    "I confirm this interpretation.",
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    correctionContext: null,
    factConfirmations: version.interpretation.facts.map(({ id }) => ({
      factId: id,
      sourceId: source.id,
    })),
    interpretationConfirmationSourceId: source.id,
  });
}

export function recordScopeAssessment(
  version: IntakeVersion,
  proposal: ScopeAssessmentOutput,
  operation: IntakeAIOperation,
): IntakeVersion {
  assertEditable(version);
  if (version.interpretationConfirmationSourceId === null) {
    throw conflict("Confirm the interpretation before assessing scope and budget.");
  }
  if (version.unresolvedCriticalUnknownIds.length > 0) {
    throw conflict("Answer the current scope question before reassessing the remaining scope.");
  }

  const candidate = validateAIProposal(() =>
    validateIntakeVersion({
      ...version,
      version: version.version + 1,
      aiOperations: [...version.aiOperations, operation],
      scopeAssessment: proposal,
      budget: {
        meaning: proposal.budget.meaning,
        evidence: proposal.budget.evidence,
        confirmationSourceId: null,
      },
      unresolvedCriticalUnknownIds: proposal.criticalUnknowns.map(({ id }) => id),
      approvedAt: null,
      approvalSourceId: null,
    }),
  );
  return candidate;
}

export function answerCriticalUnknown(
  version: IntakeVersion,
  input: { unknownId: string; answer: string },
): IntakeVersion {
  assertEditable(version);
  const assessment = version.scopeAssessment;
  if (!assessment) throw conflict("Assess the task scope before answering a scope question.");
  const currentQuestion = assessment.criticalUnknowns.find(({ id }) =>
    version.unresolvedCriticalUnknownIds.includes(id),
  );
  if (!currentQuestion || currentQuestion.id !== input.unknownId) {
    throw conflict("Answer the current highest-priority scope question first.");
  }

  const { sources } = appendUserSource(
    version,
    "user_message",
    `Answer to "${currentQuestion.question}": ${input.answer}`,
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    unresolvedCriticalUnknownIds: version.unresolvedCriticalUnknownIds.filter(
      (id) => id !== currentQuestion.id,
    ),
    budget: {
      ...version.budget,
      confirmationSourceId: null,
    },
    approvedAt: null,
    approvalSourceId: null,
  });
}

export function recordBudgetDecision(
  version: IntakeVersion,
  meaning: BudgetMeaning,
): IntakeVersion {
  assertEditable(version);
  if (version.scopeAssessment === null) {
    throw conflict("Assess the task scope before confirming a budget decision.");
  }
  const content = `Budget decision selected by the user: ${JSON.stringify(meaning)}`;
  const { source, sources } = appendUserSource(version, "user_message", content);
  const evidence =
    meaning.state === "not_provided" ? [] : [{ sourceId: source.id, quote: content }];
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    budget: { meaning, evidence, confirmationSourceId: source.id },
    approvedAt: null,
    approvalSourceId: null,
  });
}

export function recordCommunicationStylePreference(
  version: IntakeVersion,
  style: CommunicationStyle,
): IntakeVersion {
  assertEditable(version);
  const { source, sources } = appendUserSource(
    version,
    "user_message",
    `Communication style preference selected by the user: ${style}`,
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    communicationStylePreference: { style, sourceId: source.id },
  });
}

export function approveIntakeBrief(version: IntakeVersion): IntakeVersion {
  assertEditable(version);
  const readiness = evaluateIntakeReadiness(version);
  if (!readiness.ready) {
    throw conflict("The brief is not ready for approval.", { blockers: readiness.blockers });
  }

  const { source, sources } = appendUserSource(
    version,
    "user_message",
    "I approve this brief for professional discovery.",
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    approvedAt: new Date().toISOString(),
    approvalSourceId: source.id,
  });
}
