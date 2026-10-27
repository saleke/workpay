import { z } from "zod";
import { conflict, validationError } from "@workpay/shared/platform";
import { evaluateIntakeReadiness, resolveCommunicationStyle } from "@workpay/shared/domain/intake";
import type { OwnedIntakeSession } from "@workpay/shared/domain/intake";

export async function parseIntakeRequest<Schema extends z.ZodType>(
  req: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw validationError("Request body must be valid JSON.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw validationError("Request body is invalid.", {
      issues: parsed.error.issues.map(({ path, message }) => ({
        path: path.join("."),
        message,
      })),
    });
  }
  return parsed.data;
}

export function assertExpectedIntakeVersion(
  result: OwnedIntakeSession,
  expectedVersion: number,
): void {
  if (result.version.version !== expectedVersion) {
    throw conflict("The intake session changed. Reload the latest version before continuing.", {
      expectedVersion,
      currentVersion: result.version.version,
    });
  }
}

export function toIntakeResponse(result: OwnedIntakeSession) {
  const readiness = evaluateIntakeReadiness(result.version);
  const communicationStyle = resolveCommunicationStyle(
    result.version.interpretation?.taskFamiliarity ?? {
      level: "unknown",
      confidence: "low",
      evidence: [],
    },
    result.version.communicationStylePreference?.style,
  );
  return {
    sessionId: result.session.id,
    version: result.version.version,
    status: result.session.status,
    originalRequest: result.session.originalRequest,
    intake: result.version,
    readiness,
    communicationStyle,
  };
}
