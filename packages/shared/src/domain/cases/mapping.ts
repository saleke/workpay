/**
 * Mapping between authorization actors and the case vocabulary. The case
 * tables use their own `opened_by` / `author` enums, so this keeps the
 * translation in one place instead of scattering casts through the service.
 */
import type { Actor } from "../identity/authorize.js";

export type CaseOpener = "BUYER" | "PROVIDER" | "SYSTEM" | "VERIFICATION" | "PAYMENT";
export type CaseAuthor = "BUYER" | "PROVIDER" | "SYSTEM" | "AI_ASSISTANT" | "REVIEWER";

export function caseOpenerFor(actor: Actor): CaseOpener {
  switch (actor.kind) {
    case "USER":
      return actor.role === "buyer" ? "BUYER" : "SYSTEM";
    case "PROVIDER":
      return "PROVIDER";
    case "REVIEWER":
      return "SYSTEM";
    default:
      return "SYSTEM";
  }
}

export function caseAuthorFor(actor: Actor): CaseAuthor {
  switch (actor.kind) {
    case "USER":
      return actor.role === "buyer" ? "BUYER" : "REVIEWER";
    case "PROVIDER":
      return "PROVIDER";
    case "REVIEWER":
      return "REVIEWER";
    case "AGENT":
      return "AI_ASSISTANT";
    default:
      return "SYSTEM";
  }
}
