import type { CommunicationStyle, TaskFamiliarity } from "./model.js";

export function resolveCommunicationStyle(
  assessment: TaskFamiliarity,
  userPreference?: CommunicationStyle | null,
): CommunicationStyle {
  if (userPreference) return userPreference;
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
