/**
 * Verification service (Component 8).
 *
 * Runs the deterministic checks for a submission's contract and freezes an
 * AcceptanceDecision. The rules of the game:
 *
 *  - A failed deterministic check forces the whole outcome to FAIL. A semantic
 *    or human rule can never overturn it.
 *  - Uncertainty escalates to human review; it never authorizes payment.
 *  - The decision is bound to the contract version and hash. Payment capture
 *    reads the latest decision and refuses anything that is not PASS on the
 *    current hash.
 *
 * Reading the submission from object storage is I/O, so it happens outside any
 * transaction; the results are written in one transaction afterwards.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { acceptanceRules as acceptanceRulesTable } from "../../db/schema/contracts.js";
import {
  verificationResults,
  verificationRuns,
  acceptanceDecisions,
  evidence,
} from "../../db/schema/verification.js";
import { workSubmissions, submissionArtifacts, workExecutions } from "../../db/schema/execution.js";
import { contractRequirements } from "../../db/schema/contracts.js";
import { appendEvent } from "../../events/outbox.js";
import { logger } from "../../platform/logger.js";
import { newId } from "../../platform/ids.js";
import { notFound, conflict } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { getObjectStorage } from "../../integrations/storage/index.js";
import { getAIClient, type AIClient } from "../../integrations/ai/index.js";
import { runDeterministicCheck, parseCsv, type Dataset } from "./checks.js";

export interface RuleOutcome {
  requirementKey: string;
  /** Verification result method vocabulary (HUMAN, not HUMAN_REVIEW). */
  method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN";
  outcome: "PASS" | "FAIL" | "UNCERTAIN";
  confidence: number;
  rationale: string;
  detail?: Record<string, unknown>;
  advisoryOutcome?: "PASS" | "FAIL" | "UNCERTAIN";
}

export async function startVerification(
  tx: Database,
  options: { submissionId: string; actor: Actor; correlationId: string },
) {
  const [submission] = await tx
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.id, options.submissionId))
    .limit(1);
  if (!submission) throw notFound("Submission");
  if (submission.status !== "SUBMITTED") {
    throw conflict(
      `Submission must be SUBMITTED before verification (status ${submission.status})`,
    );
  }

  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.id, submission.executionId))
    .limit(1);
  if (!execution) throw notFound("Execution");

  const verificationRunId = newId("vrun");
  await tx.insert(verificationRuns).values({
    id: verificationRunId,
    taskId: submission.taskId,
    submissionId: submission.id,
    contractId: execution.contractId,
    contractVersion: submission.contractVersion,
    contractHash: submission.contractHash,
    status: "RUNNING",
  });

  await appendEvent(tx, {
    type: "VERIFICATION_STARTED",
    aggregateId: verificationRunId,
    taskId: submission.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: submission.taskId,
      verificationRunId,
      submissionId: submission.id,
      contractVersion: submission.contractVersion,
    },
  });

  return verificationRunId;
}

/** Load the rules and the deliverable dataset for a run. I/O only. */
async function collectVerificationInputs(db: Database, verificationRunId: string) {
  const [run] = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.id, verificationRunId))
    .limit(1);
  if (!run) throw notFound("Verification run");

  const [submission] = await db
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.id, run.submissionId))
    .limit(1);
  if (!submission) throw notFound("Submission");

  const rules = await db
    .select()
    .from(acceptanceRulesTable)
    .where(eq(acceptanceRulesTable.contractId, run.contractId));

  const contractReqs = await db
    .select()
    .from(contractRequirements)
    .where(eq(contractRequirements.contractId, run.contractId));

  const artifacts = await db
    .select()
    .from(submissionArtifacts)
    .where(eq(submissionArtifacts.submissionId, submission.id));

  // Parse the primary deliverable as a dataset when it is tabular.
  const primary = artifacts.find((a) => a.type === "PRIMARY_DELIVERABLE") ?? artifacts[0] ?? null;
  let dataset: Dataset = { columns: [], rows: [] };
  if (primary) {
    try {
      const bytes = await getObjectStorage().get(primary.storageKey);
      const text = new TextDecoder().decode(bytes);
      const looksTabular =
        (primary.contentType ?? "").includes("csv") ||
        primary.filename.toLowerCase().endsWith(".csv") ||
        (primary.contentType ?? "").startsWith("text/");
      if (looksTabular) dataset = parseCsv(text);
    } catch (error) {
      logger.warn({ err: String(error), storageKey: primary.storageKey }, "artifact read failed");
    }
  }

  // A bounded, provider-supplied summary is the only material handed to the
  // semantic verifier; it never reads arbitrary file contents.
  const deliverableSummary = [
    submission.notes,
    submission.summary ? JSON.stringify(submission.summary) : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  return { run, contractRequirements: contractReqs, rules, dataset, deliverableSummary };
}

/**
 * Evaluate every acceptance rule. Deterministic rules are pure and
 * authoritative for their requirement. Semantic rules are delegated to the AI
 * adapter (structured output only); a human rule always escalates. Confidence
 * is recorded but never overrides the acceptance policy.
 */
export async function evaluateRules(
  contractRequirements: Array<{ key: string; statement: string }>,
  rules: Array<{
    requirementKey: string;
    method: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
    params: unknown;
    instructions: string | null;
  }>,
  dataset: Dataset,
  options: { taskId: string; deliverableSummary: string; ai?: AIClient } = {
    taskId: "",
    deliverableSummary: "",
  },
): Promise<RuleOutcome[]> {
  const ruleByRequirement = new Map(rules.map((rule) => [rule.requirementKey, rule]));
  const outcomes: RuleOutcome[] = [];

  for (const requirement of contractRequirements) {
    const rule = ruleByRequirement.get(requirement.key);
    if (!rule) {
      outcomes.push({
        requirementKey: requirement.key,
        method: "HUMAN",
        outcome: "UNCERTAIN",
        confidence: 0,
        rationale: "No acceptance rule is defined for this requirement; human review required.",
      });
      continue;
    }

    if (rule.method === "DETERMINISTIC") {
      const params = (rule.params ?? {}) as Record<string, unknown>;
      const check = typeof params.check === "string" ? params.check : "";
      const result = runDeterministicCheck(check, params, dataset);
      outcomes.push({
        requirementKey: requirement.key,
        method: "DETERMINISTIC",
        outcome: result.outcome,
        confidence: result.confidence,
        rationale: result.rationale,
        ...(result.detail ? { detail: result.detail } : {}),
      });
      continue;
    }

    if (rule.method === "SEMANTIC" && options.ai) {
      try {
        const assessment = await options.ai.assessRequirement({
          taskId: options.taskId,
          requirementKey: requirement.key,
          requirementStatement: requirement.statement,
          ...(rule.instructions ? { instructions: rule.instructions } : {}),
          deliverableSummary: options.deliverableSummary,
        });
        outcomes.push({
          requirementKey: requirement.key,
          method: "SEMANTIC",
          outcome: "UNCERTAIN",
          confidence: 0,
          rationale:
            "AI assessment is advisory evidence only and cannot determine acceptance. " +
            assessment.rationale,
          detail: {
            advisoryOutcome: assessment.outcome,
            advisoryConfidence: assessment.confidence,
            evidence: assessment.evidence,
          },
          advisoryOutcome: assessment.outcome,
        });
      } catch (error) {
        logger.warn(
          { err: String(error), requirementKey: requirement.key },
          "semantic check failed",
        );
        outcomes.push({
          requirementKey: requirement.key,
          method: "SEMANTIC",
          outcome: "UNCERTAIN",
          confidence: 0,
          rationale: "The semantic check could not be completed; human review required.",
        });
      }
      continue;
    }

    outcomes.push({
      requirementKey: requirement.key,
      method: rule.method === "SEMANTIC" ? "SEMANTIC" : "HUMAN",
      outcome: "UNCERTAIN",
      confidence: 0,
      rationale:
        rule.instructions ??
        `Requirement requires ${rule.method.toLowerCase()} review; human decision required.`,
    });
  }

  return outcomes;
}

export interface VerificationOutcome {
  verificationRunId: string;
  acceptanceDecisionId: string;
  outcome: "PASS" | "FAIL" | "UNCERTAIN";
  results: RuleOutcome[];
}

/**
 * Aggregate evidence without allowing semantic AI to decide acceptance.
 * Deterministic checks can decide only the properties they actually test;
 * semantic and human-review rules remain unresolved until the applicable
 * human process is completed.
 */
export function aggregateVerificationOutcome(
  results: RuleOutcome[],
): "PASS" | "FAIL" | "UNCERTAIN" {
  if (results.length === 0) return "UNCERTAIN";

  const deterministicFailure = results.some(
    (result) => result.method === "DETERMINISTIC" && result.outcome === "FAIL",
  );
  if (deterministicFailure) return "FAIL";

  const unresolved = results.some(
    (result) =>
      result.method !== "DETERMINISTIC" ||
      result.outcome === "UNCERTAIN" ||
      result.outcome === "FAIL",
  );
  return unresolved ? "UNCERTAIN" : "PASS";
}

/**
 * Execute a verification run end to end and freeze the acceptance decision.
 * The caller transitions the task based on the returned outcome.
 */
export async function executeVerification(options: {
  verificationRunId: string;
  actor: Actor;
  correlationId: string;
}): Promise<VerificationOutcome> {
  const db = (await import("../../db/client.js")).getDb();
  const { run, contractRequirements, rules, dataset, deliverableSummary } =
    await collectVerificationInputs(db, options.verificationRunId);

  const results = await evaluateRules(contractRequirements, rules, dataset, {
    taskId: run.taskId,
    deliverableSummary,
    ai: getAIClient(),
  });
  const failed = results.filter((r) => r.outcome === "FAIL");
  const uncertain = results.filter((r) => r.outcome === "UNCERTAIN");
  const passed = results.filter((r) => r.outcome === "PASS");
  const outcome = aggregateVerificationOutcome(results);

  return withTransaction(async (tx) => {
    for (const result of results) {
      const resultId = newId("vres");
      await tx.insert(verificationResults).values({
        id: resultId,
        verificationRunId: run.id,
        requirementKey: result.requirementKey,
        method: result.method,
        outcome: result.outcome,
        confidence: String(result.confidence.toFixed(4)),
        rationale: result.rationale,
        detail: result.detail ?? null,
      });
      if (result.outcome !== "PASS") {
        await tx.insert(evidence).values({
          id: newId("cev"),
          taskId: run.taskId,
          verificationRunId: run.id,
          verificationResultId: resultId,
          type: result.method === "DETERMINISTIC" ? "METRIC" : "HUMAN_NOTE",
          description: result.rationale,
          payload: result.detail ?? null,
        });
      }
    }

    await tx
      .update(verificationRuns)
      .set({
        status: "COMPLETED",
        outcome,
        passedCount: passed.length,
        failedCount: failed.length,
        uncertainCount: uncertain.length,
        summary: `PASS ${passed.length}, FAIL ${failed.length}, UNCERTAIN ${uncertain.length}`,
        completedAt: new Date(),
      })
      .where(eq(verificationRuns.id, run.id));

    const acceptanceDecisionId = newId("adec");
    await tx.insert(acceptanceDecisions).values({
      id: acceptanceDecisionId,
      taskId: run.taskId,
      submissionId: run.submissionId,
      verificationRunId: run.id,
      contractId: run.contractId,
      contractVersion: run.contractVersion,
      contractHash: run.contractHash,
      outcome,
      hasDeterministicFailure: failed.some((f) => f.method === "DETERMINISTIC"),
      explanation:
        outcome === "PASS"
          ? "All acceptance requirements passed."
          : outcome === "FAIL"
            ? `Failed requirement(s): ${failed.map((f) => f.requirementKey).join(", ")}`
            : `Needs human review: ${uncertain.map((u) => u.requirementKey).join(", ")}`,
    });

    if (outcome === "PASS") {
      await appendEvent(tx, {
        type: "VERIFICATION_PASSED",
        aggregateId: run.id,
        taskId: run.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: run.taskId,
          verificationRunId: run.id,
          acceptanceDecisionId,
          submissionId: run.submissionId,
          contractId: run.contractId,
          contractVersion: run.contractVersion,
          contractHash: run.contractHash,
          passedRequirements: passed.length,
          failedRequirements: failed.length,
        },
      });
    } else if (outcome === "FAIL") {
      await appendEvent(tx, {
        type: "VERIFICATION_FAILED",
        aggregateId: run.id,
        taskId: run.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: run.taskId,
          verificationRunId: run.id,
          acceptanceDecisionId,
          submissionId: run.submissionId,
          contractId: run.contractId,
          contractVersion: run.contractVersion,
          failedRequirements: failed.map((f) => f.requirementKey),
        },
      });
    } else {
      await appendEvent(tx, {
        type: "VERIFICATION_UNCERTAIN",
        aggregateId: run.id,
        taskId: run.taskId,
        actor: toEventActor(options.actor),
        correlationId: options.correlationId,
        payload: {
          taskId: run.taskId,
          verificationRunId: run.id,
          acceptanceDecisionId,
          submissionId: run.submissionId,
          uncertainRequirements: uncertain.map((u) => u.requirementKey),
        },
      });
    }

    return { verificationRunId: run.id, acceptanceDecisionId, outcome, results };
  });
}

/** The latest acceptance decision for a task, if any. */
export async function getLatestAcceptanceDecision(db: Database, taskId: string) {
  const [decision] = await db
    .select()
    .from(acceptanceDecisions)
    .where(eq(acceptanceDecisions.taskId, taskId))
    .orderBy(desc(acceptanceDecisions.createdAt))
    .limit(1);
  return decision ?? null;
}

/** Load a verification run with its per-requirement results and evidence. */
export async function getVerificationDetail(db: Database, verificationRunId: string) {
  const [run] = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.id, verificationRunId))
    .limit(1);
  if (!run) return null;
  const results = await db
    .select()
    .from(verificationResults)
    .where(eq(verificationResults.verificationRunId, verificationRunId));
  const runEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.verificationRunId, verificationRunId));
  return { run, results, evidence: runEvidence };
}

/** Whether a PASS decision exists that is bound to this exact contract hash. */
export async function hasPassingDecisionForHash(
  db: Database,
  taskId: string,
  contractHash: string,
): Promise<boolean> {
  const [decision] = await db
    .select()
    .from(acceptanceDecisions)
    .where(
      and(
        eq(acceptanceDecisions.taskId, taskId),
        eq(acceptanceDecisions.contractHash, contractHash),
        eq(acceptanceDecisions.outcome, "PASS"),
      ),
    )
    .limit(1);
  return Boolean(decision);
}
