import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { intakeSessions, intakeVersions } from "../../db/schema/intake.js";
import { conflict, notFound, validationError } from "../../platform/errors.js";
import { newId } from "../../platform/ids.js";
import { evaluateIntakeReadiness } from "./readiness.js";
import { createInitialIntakeVersion, validateIntakeVersion, type IntakeVersion } from "./model.js";

export interface OwnedIntakeSession {
  session: typeof intakeSessions.$inferSelect;
  version: IntakeVersion;
}

export async function createIntakeSession(
  db: Database,
  input: { userId: string; originalRequest: string },
): Promise<OwnedIntakeSession> {
  const originalRequest = input.originalRequest;
  if (originalRequest.length === 0 || originalRequest.length > 20_000) {
    throw validationError("Original request must contain between 1 and 20,000 characters.");
  }
  if (originalRequest.trim().length === 0) {
    throw validationError("Please describe the work you need done.");
  }
  const id = newId("session");
  const version = createInitialIntakeVersion(originalRequest);

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(intakeSessions)
      .values({
        id,
        userId: input.userId,
        originalRequest,
        currentVersion: version.version,
        status: "DRAFT",
      })
      .returning();
    if (!session) throw new Error("Intake session insert returned no row");

    await tx.insert(intakeVersions).values({
      id: newId("intakever"),
      sessionId: id,
      version: version.version,
      snapshot: version,
      createdBy: input.userId,
    });
    return { session, version };
  });
}

export async function getIntakeSession(
  db: Database,
  input: { sessionId: string; userId: string },
): Promise<OwnedIntakeSession> {
  const [session] = await db
    .select()
    .from(intakeSessions)
    .where(and(eq(intakeSessions.id, input.sessionId), eq(intakeSessions.userId, input.userId)))
    .limit(1);
  if (!session) throw notFound("Intake session");

  const [record] = await db
    .select()
    .from(intakeVersions)
    .where(
      and(
        eq(intakeVersions.sessionId, session.id),
        eq(intakeVersions.version, session.currentVersion),
      ),
    )
    .limit(1);
  if (!record) throw new Error("Intake session points to a missing version");
  return { session, version: validateIntakeVersion(record.snapshot) };
}

export async function appendIntakeVersion(
  db: Database,
  input: {
    sessionId: string;
    userId: string;
    expectedVersion: number;
    snapshot: IntakeVersion;
  },
): Promise<OwnedIntakeSession> {
  const snapshot = validateIntakeVersion(input.snapshot);
  if (snapshot.version !== input.expectedVersion + 1) {
    throw new Error("New intake versions must increment the expected version by one");
  }

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(intakeSessions)
      .where(and(eq(intakeSessions.id, input.sessionId), eq(intakeSessions.userId, input.userId)))
      .for("update")
      .limit(1);
    if (!session) throw notFound("Intake session");
    if (session.currentVersion !== input.expectedVersion) {
      throw conflict("The intake session changed. Reload the latest version before continuing.", {
        expectedVersion: input.expectedVersion,
        currentVersion: session.currentVersion,
      });
    }
    if (session.status === "APPROVED") {
      throw conflict("An approved brief is frozen and cannot be edited.");
    }

    const [previous] = await tx
      .select()
      .from(intakeVersions)
      .where(
        and(
          eq(intakeVersions.sessionId, session.id),
          eq(intakeVersions.version, session.currentVersion),
        ),
      )
      .limit(1);
    if (!previous) throw new Error("Intake session points to a missing version");

    const priorSnapshot = validateIntakeVersion(previous.snapshot);
    if (snapshot.sources.length < priorSnapshot.sources.length) {
      throw conflict("Intake source history cannot be removed.");
    }
    const preservedSources = snapshot.sources.slice(0, priorSnapshot.sources.length);
    if (JSON.stringify(preservedSources) !== JSON.stringify(priorSnapshot.sources)) {
      throw conflict("Existing intake sources are immutable.");
    }

    const readiness = evaluateIntakeReadiness(snapshot);
    const status = snapshot.approvedAt ? "APPROVED" : readiness.ready ? "READY" : "DRAFT";
    const [updated] = await tx
      .update(intakeSessions)
      .set({
        currentVersion: snapshot.version,
        status,
        approvedAt: snapshot.approvedAt ? new Date(snapshot.approvedAt) : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(intakeSessions.id, session.id),
          eq(intakeSessions.userId, input.userId),
          eq(intakeSessions.currentVersion, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) {
      throw conflict("The intake session changed. Reload the latest version before continuing.");
    }

    await tx.insert(intakeVersions).values({
      id: newId("intakever"),
      sessionId: session.id,
      version: snapshot.version,
      snapshot,
      createdBy: input.userId,
    });
    return { session: updated, version: snapshot };
  });
}
