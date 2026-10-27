import type { CommunicationStyle, IntakeVersion, TaskFamiliarity } from "./model.js";

export function resolveCommunicationStyle(assessment: TaskFamiliarity): CommunicationStyle {
  if (
    assessment.level === "unknown" ||
    assessment.level === "new_to_task" ||
    assessment.confidence === "low"
  ) {
    return "plain_language";
  }
  if (assessment.level === "experienced" && assessment.confidence === "high") {
    return "technical";
  }
  return "balanced";
}

export function resolveIntakeCommunicationStyle(version: IntakeVersion): CommunicationStyle {
  const familiarity = version.interpretation?.taskFamiliarity ??
    version.correctionContext?.taskFamiliarity ?? {
      level: "unknown",
      confidence: "low",
      evidence: [],
    };
  return resolveCommunicationStyle(familiarity);
}
