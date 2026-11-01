import { conflict, externalFailure, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import {
  type AnswerOptionSuggestionOutput,
  type BudgetMeaning,
  type CommunicationStyle,
  type IntakeAIOperation,
  type IntakeSource,
  type IntakeVersion,
  type IntentInterpretationOutput,
  type ProfessionalBrief,
  type ProfessionalBriefEdit,
  type ScopeAssessmentOutput,
  budgetUsesBetaContractCurrency,
  isPricedBetaContractBudget,
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
  if (content.trim().length === 0 || content.length > 30_000) {
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
      professionalBrief: null,
      clarificationAnswers: [],
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
      professionalBrief: null,
      clarificationAnswers: [],
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
    professionalBrief: null,
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
      professionalBrief: null,
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

function validateProfessionalBriefEvidence(
  brief: ProfessionalBrief,
  sources: IntakeSource[],
): void {
  const sections = [
    brief.title,
    brief.goalAndContext,
    ...brief.deliverables,
    ...brief.requirements,
    ...brief.boundaries,
    ...brief.inputsAndDependencies,
    ...(brief.timing ? [brief.timing] : []),
  ];
  for (const section of sections) {
    for (const evidence of section.evidence) {
      const source = sources.find((item) => item.id === evidence.sourceId);
      if (
        !source ||
        !["original_request", "user_message", "user_correction"].includes(source.kind) ||
        !source.content.includes(evidence.quote)
      ) {
        throw externalFailure(
          "The professional brief could not be matched to confirmed user-provided information.",
        );
      }
    }
  }
}

export function recordProfessionalBriefProposal(
  version: IntakeVersion,
  proposal: ProfessionalBrief,
  operation: IntakeAIOperation,
): IntakeVersion {
  assertEditable(version);
  if (!evaluateIntakeReadiness(version).ready) {
    throw conflict(
      "Complete and confirm the intake details before composing a professional brief.",
    );
  }
  validateProfessionalBriefEvidence(proposal, version.sources);
  return validateAIProposal(() =>
    validateIntakeVersion({
      ...version,
      version: version.version + 1,
      aiOperations: [...version.aiOperations, operation],
      professionalBrief: proposal,
    }),
  );
}

export function saveProfessionalBriefEdits(
  version: IntakeVersion,
  brief: ProfessionalBriefEdit["brief"],
): IntakeVersion {
  assertEditable(version);
  if (!version.professionalBrief) {
    throw conflict("Compose the professional brief before editing it.");
  }

  const normalized = {
    title: brief.title.trim(),
    goalAndContext: brief.goalAndContext.trim(),
    deliverables: brief.deliverables.map((item) => item.trim()),
    requirements: brief.requirements.map((item) => item.trim()).filter(Boolean),
    boundaries: brief.boundaries.map((item) => item.trim()).filter(Boolean),
    inputsAndDependencies: brief.inputsAndDependencies.map((item) => item.trim()).filter(Boolean),
    timing: brief.timing.trim(),
  };
  const content = [
    "Requester-edited professional-facing task brief:",
    normalized.title,
    normalized.goalAndContext,
    ...normalized.deliverables,
    ...normalized.requirements,
    ...normalized.boundaries,
    ...normalized.inputsAndDependencies,
    normalized.timing,
  ]
    .filter(Boolean)
    .join("\n");
  const { source, sources } = appendUserSource(version, "user_message", content);
  const evidence = (text: string) => [{ sourceId: source.id, quote: text }];
  const result: ProfessionalBrief = {
    title: { text: normalized.title, evidence: evidence(normalized.title) },
    goalAndContext: {
      text: normalized.goalAndContext,
      evidence: evidence(normalized.goalAndContext),
    },
    deliverables: normalized.deliverables.map((text) => ({ text, evidence: evidence(text) })),
    requirements: normalized.requirements.map((text) => ({ text, evidence: evidence(text) })),
    boundaries: normalized.boundaries.map((text) => ({ text, evidence: evidence(text) })),
    inputsAndDependencies: normalized.inputsAndDependencies.map((text) => ({
      text,
      evidence: evidence(text),
    })),
    timing: normalized.timing
      ? { text: normalized.timing, evidence: evidence(normalized.timing) }
      : null,
  };
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    professionalBrief: result,
    approvedAt: null,
    approvalSourceId: null,
  });
}

export function recordAnswerOptionSuggestions(
  version: IntakeVersion,
  unknownId: string,
  proposal: AnswerOptionSuggestionOutput,
  operation: IntakeAIOperation,
): IntakeVersion {
  assertEditable(version);
  const scopeAssessment = version.scopeAssessment;
  if (version.interpretationConfirmationSourceId === null || !scopeAssessment) {
    throw conflict("Confirm the interpretation and assess scope before requesting answer options.");
  }
  const currentQuestion = scopeAssessment.criticalUnknowns.find(
    ({ id }) => id === unknownId && version.unresolvedCriticalUnknownIds.includes(id),
  );
  if (!currentQuestion) {
    throw conflict("Answer options can only be requested for the current scope question.");
  }

  return validateAIProposal(() =>
    validateIntakeVersion({
      ...version,
      version: version.version + 1,
      aiOperations: [...version.aiOperations, operation],
      scopeAssessment: {
        ...scopeAssessment,
        criticalUnknowns: scopeAssessment.criticalUnknowns.map((question) =>
          question.id === unknownId
            ? { ...question, answerOptions: proposal.answerOptions }
            : question,
        ),
      },
    }),
  );
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

  const { source, sources } = appendUserSource(
    version,
    "user_message",
    `Answer to "${currentQuestion.question}": ${input.answer}`,
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    clarificationAnswers: [
      ...version.clarificationAnswers,
      {
        unknownId: currentQuestion.id,
        question: currentQuestion.question,
        answer: input.answer,
        sourceId: source.id,
      },
    ],
    professionalBrief: null,
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
  if (!budgetUsesBetaContractCurrency(meaning)) {
    throw conflict(
      "This beta creates contracts in USD only. Enter a USD amount you explicitly accept; WorkPay will not convert another currency automatically.",
    );
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
    professionalBrief: null,
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
  if (!version.professionalBrief) {
    throw conflict("Compose and review the professional-facing brief before approving it.");
  }
  const readiness = evaluateIntakeReadiness(version);
  if (!readiness.ready) {
    throw conflict("The brief is not ready for approval.", { blockers: readiness.blockers });
  }
  if (!isPricedBetaContractBudget(version.budget.meaning)) {
    throw conflict(
      "Confirm a specific USD target, ceiling, or range before approving the brief for contract review.",
    );
  }

  const { source, sources } = appendUserSource(
    version,
    "user_message",
    `I approve this exact professional-facing brief for discovery: ${JSON.stringify(version.professionalBrief)}`,
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    approvedAt: new Date().toISOString(),
    approvalSourceId: source.id,
  });
}

export function reopenApprovedIntakeBudget(version: IntakeVersion): IntakeVersion {
  if (version.approvedAt === null || version.approvalSourceId === null) {
    throw conflict("Only an approved intake can be reopened for a budget correction.");
  }
  const { sources } = appendUserSource(
    version,
    "user_message",
    "I reopened this approved intake to explicitly confirm a supported contract budget.",
  );
  return validateIntakeVersion({
    ...version,
    version: version.version + 1,
    sources,
    professionalBrief: null,
    budget: {
      ...version.budget,
      confirmationSourceId: null,
    },
    approvedAt: null,
    approvalSourceId: null,
  });
}
