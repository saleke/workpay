/**
 * Domain subpath barrel.
 *
 * Domain modules contain the business rules. They are shared by the web app
 * (route handlers) and the worker (jobs), so no rule may live in a route
 * handler or a job. Each module exposes functions that take a transaction
 * handle where they mutate state, so callers control atomicity.
 *
 * The pure rule modules (authorize, policy, compiler, guardrails, selection,
 * verification checks, agent authority) have no I/O and are the most heavily
 * tested. The service modules are thin orchestrators over the schema.
 */

// Context and identity
export * from "./context.js";
export * from "./identity/authorize.js";
export * from "./identity/verification.js";

// Tasks
export * from "./tasks/state.js";
export * from "./tasks/service.js";

// Planning
export * from "./planning/fallback.js";
export * from "./planning/service.js";

// Contracts
export * from "./contracts/compiler.js";
export * from "./contracts/plan-snapshot.js";
export * from "./contracts/service.js";

// Providers
export * from "./providers/selection.js";
export * from "./providers/service.js";

// Negotiation
export * from "./negotiation/guardrails.js";
export * from "./negotiation/service.js";

// Payments
export * from "./payments/policy.js";
export * from "./payments/service.js";

// Execution and submission
export * from "./execution/service.js";

// Verification
export * from "./verification/checks.js";
export * from "./verification/service.js";

// Cases
export * from "./cases/mapping.js";
export * from "./cases/service.js";

// Agent
export * from "./agent/authority.js";
export * from "./agent/service.js";
export * from "./agent/orchestrator.js";

// Activity projection
export * from "./activity/project.js";

// Consultative Scoping & Information Threshold Model
export * from "./scoping/index.js";
