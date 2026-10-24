/**
 * Contextual Resource Ingestion for Consultative Scoping.
 *
 * Ingests and analyzes technical resources provided alongside user goals:
 * 1. Git repository URLs or dependency manifests (package.json, Cargo.toml, requirements.txt)
 * 2. API specifications (OpenAPI, Swagger, GraphQL, SQL DDL)
 * 3. Diagnostic logs and stack traces
 */

export interface IngestedRepoInfo {
  url?: string;
  inferredLanguage?: string;
  inferredFrameworks: string[];
  inferredDatabase?: string;
  inferredTesting?: string;
  summary: string;
}

export interface IngestedSchemaInfo {
  specType: "openapi" | "graphql" | "sql_ddl" | "unknown";
  entityCount: number;
  operationCount: number;
  sampleEntities: string[];
  summary: string;
}

export interface IngestedLogInfo {
  runtime?: string;
  errorClass?: string;
  errorMessage?: string;
  failingFile?: string;
  summary: string;
}

import type { ScopingResourceInput } from "./types.js";

export interface SynthesizedIntakeResult {
  enrichedGoal: string;
  extractedSlots: Record<string, string>;
  detectedDomainHint?: string;
  inferredBudgetMinor?: number;
  repoInfo?: IngestedRepoInfo;
  schemaInfo?: IngestedSchemaInfo;
  logInfo?: IngestedLogInfo;
}

/**
 * Inspects repository URL or pasted dependency manifest / tech summary.
 */
export function inspectRepositoryContext(rawText: string): IngestedRepoInfo | null {
  if (!rawText || rawText.trim().length === 0) return null;
  const lower = rawText.toLowerCase();

  const frameworks: string[] = [];
  if (/next\.?js|react/i.test(lower)) frameworks.push("React / Next.js");
  if (/vue|nuxt/i.test(lower)) frameworks.push("Vue / Nuxt");
  if (/express|fastify|nestjs/i.test(lower)) frameworks.push("Node.js Backend");
  if (/fastapi|django|flask/i.test(lower)) frameworks.push("Python Backend");
  if (/axum|actix|tokio/i.test(lower)) frameworks.push("Rust Backend");
  if (/gin|echo|fiber/i.test(lower)) frameworks.push("Go Backend");
  if (/flutter|react[- ]native|swift|kotlin/i.test(lower)) frameworks.push("Mobile Framework");

  let language: string | undefined;
  if (/typescript|\.ts\b/i.test(lower)) language = "TypeScript";
  else if (/javascript|\.js\b/i.test(lower)) language = "JavaScript";
  else if (/python|\.py\b/i.test(lower)) language = "Python";
  else if (/rust|\.rs\b/i.test(lower)) language = "Rust";
  else if (/golang|\.go\b/i.test(lower)) language = "Go";

  let database: string | undefined;
  if (/postgres|psql|supabase/i.test(lower)) database = "PostgreSQL";
  else if (/mysql|mariadb/i.test(lower)) database = "MySQL";
  else if (/mongo|documentdb/i.test(lower)) database = "MongoDB";
  else if (/redis|valkey/i.test(lower)) database = "Redis";
  else if (/sqlite|turso/i.test(lower)) database = "SQLite";

  let testing: string | undefined;
  if (/jest|vitest/i.test(lower)) testing = "Vitest / Jest Test Suite";
  else if (/pytest/i.test(lower)) testing = "Pytest Automated Suite";
  else if (/playwright|cypress/i.test(lower)) testing = "Playwright E2E Integration Suite";
  else if (/cargo test/i.test(lower)) testing = "Cargo Native Test Suite";

  const gitUrlMatch = rawText.match(/https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/i);
  const url = gitUrlMatch ? gitUrlMatch[0] : undefined;

  const summaryParts: string[] = [];
  if (language) summaryParts.push(`Language: ${language}`);
  if (frameworks.length > 0) summaryParts.push(`Framework: ${frameworks.join(", ")}`);
  if (database) summaryParts.push(`Database: ${database}`);
  if (testing) summaryParts.push(`Verification: ${testing}`);

  return {
    url,
    inferredLanguage: language,
    inferredFrameworks: frameworks,
    inferredDatabase: database,
    inferredTesting: testing,
    summary: summaryParts.length > 0 ? summaryParts.join(" | ") : "Repository context ingested",
  };
}

/**
 * Inspects pasted API specification (OpenAPI, Swagger, GraphQL, SQL DDL).
 */
export function inspectSchemaContext(specText: string): IngestedSchemaInfo | null {
  if (!specText || specText.trim().length === 0) return null;
  const lower = specText.toLowerCase();

  let specType: "openapi" | "graphql" | "sql_ddl" | "unknown" = "unknown";
  if (/openapi|swagger|paths:|"paths":/i.test(lower)) {
    specType = "openapi";
  } else if (/type\s+query|type\s+mutation|schema\s*\{/i.test(lower)) {
    specType = "graphql";
  } else if (/create\s+table|primary\s+key|foreign\s+key/i.test(lower)) {
    specType = "sql_ddl";
  }

  // Extract entity names
  const entities: string[] = [];
  const tableMatches = specText.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_"]+)/gi);
  for (const m of tableMatches) {
    if (m[1]) entities.push(m[1].replace(/["`]/g, ""));
  }

  const pathMatches = specText.matchAll(/(?:\/api\/v\d+\/[a-zA-Z0-9_-]+|"(?:\/[a-zA-Z0-9_{}/-]+)":)/gi);
  let operationCount = 0;
  for (const m of pathMatches) {
    operationCount++;
    if (entities.length < 5 && m[0]) {
      entities.push(m[0].replace(/["`:]/g, ""));
    }
  }

  const entityCount = Math.max(entities.length, operationCount);

  return {
    specType,
    entityCount,
    operationCount,
    sampleEntities: entities.slice(0, 5),
    summary: `${specType.toUpperCase()} specification with ~${entityCount} declared models/endpoints.`,
  };
}

/**
 * Inspects error logs or terminal stack traces.
 */
export function inspectLogContext(logText: string): IngestedLogInfo | null {
  if (!logText || logText.trim().length === 0) return null;

  let runtime: string | undefined;
  if (/at\s+.*\(.*:[0-9]+:[0-9]+\)|node_modules/i.test(logText)) runtime = "Node.js / V8";
  else if (/File ".*", line [0-9]+|Traceback \(most recent call last\)/i.test(logText)) runtime = "Python";
  else if (/panic:|fatal error:|goroutine/i.test(logText)) runtime = "Go";
  else if (/thread 'main' panicked at/i.test(logText)) runtime = "Rust";

  const errorClassMatch = logText.match(/([a-zA-Z0-9_]+(?:Error|Exception|Panic|Fault)): (.*)/i);
  const errorClass = errorClassMatch ? errorClassMatch[1] : undefined;
  const errorMessage = errorClassMatch ? errorClassMatch[2]?.slice(0, 120) : undefined;

  const fileMatch = logText.match(/(?:at |File ")([\/a-zA-Z0-9_.-]+\.(?:ts|js|py|rs|go|tsx|jsx)):([0-9]+)/i);
  const failingFile = fileMatch ? `${fileMatch[1]}:${fileMatch[2]}` : undefined;

  const summary = errorClass
    ? `Identified ${errorClass}${failingFile ? ` in ${failingFile}` : ""}`
    : "Diagnostic log ingested for root-cause analysis";

  return {
    runtime,
    errorClass,
    errorMessage,
    failingFile,
    summary,
  };
}

/**
 * Combines raw user goal with any provided technical resources into an enriched context.
 * Pre-populates slot answers that can be deterministically inferred from the resources.
 */
export function synthesizeInitialIntake(
  rawGoal: string,
  resources?: ScopingResourceInput,
): SynthesizedIntakeResult {
  const extractedSlots: Record<string, string> = {};
  const enrichmentNotes: string[] = [];

  let repoInfo: IngestedRepoInfo | null = null;
  let schemaInfo: IngestedSchemaInfo | null = null;
  let logInfo: IngestedLogInfo | null = null;

  if (resources?.repoUrl || resources?.repoTechSummary) {
    const combined = `${resources.repoUrl || ""} ${resources.repoTechSummary || ""}`;
    repoInfo = inspectRepositoryContext(combined);
    if (resources.repoTechSummary) {
      enrichmentNotes.push(`Repository Context: ${resources.repoTechSummary}`);
    } else if (repoInfo) {
      enrichmentNotes.push(`Repository: ${repoInfo.summary}`);
    }
    if (repoInfo) {
      if (repoInfo.inferredDatabase) {
        extractedSlots["databaseAndState"] = repoInfo.inferredDatabase;
      }
      if (repoInfo.inferredTesting) {
        extractedSlots["validationProof"] = repoInfo.inferredTesting;
      }
    }
  }

  if (resources?.schemaSpec) {
    schemaInfo = inspectSchemaContext(resources.schemaSpec);
    if (schemaInfo && schemaInfo.specType !== "unknown") {
      enrichmentNotes.push(`API Spec: ${schemaInfo.summary}`);
      extractedSlots["dataArchitecture"] = `${schemaInfo.specType.toUpperCase()} schema with verified contract compliance`;
    }
  }

  if (resources?.errorLogs) {
    logInfo = inspectLogContext(resources.errorLogs);
    if (logInfo) {
      enrichmentNotes.push(`Log Diagnostic: ${logInfo.summary}`);
      if (logInfo.failingFile || logInfo.errorClass) {
        extractedSlots["validationProof"] = `Zero-reproduction verification proving ${logInfo.errorClass || "incident"} is resolved`;
      }
    }
  }

  const enrichedGoal = enrichmentNotes.length > 0
    ? `${rawGoal.trim()}\n\n[Ingested Technical Context]:\n${enrichmentNotes.map((n) => `- ${n}`).join("\n")}`
    : rawGoal.trim();

  let detectedDomainHint: string | undefined;
  if (logInfo) {
    detectedDomainHint = "cloud_devops";
  } else if (schemaInfo && schemaInfo.specType === "openapi") {
    detectedDomainHint = "api_integration";
  }

  return {
    enrichedGoal,
    extractedSlots,
    detectedDomainHint,
    repoInfo: repoInfo || undefined,
    schemaInfo: schemaInfo || undefined,
    logInfo: logInfo || undefined,
  };
}
