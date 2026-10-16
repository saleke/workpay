/**
 * Domain subpath barrel.
 *
 * Domain modules contain the business rules. They are shared by the web app
 * (route handlers) and the worker (jobs), so no rule may live in a route
 * handler or a job. Each module exposes functions that take a transaction
 * handle where they mutate state, so callers control atomicity.
 *
 * The pure rule modules (authorize, policy, compiler, guardrails) have no I/O
 * and are the most heavily tested. The service modules are thin orchestrators
 * over the schema.
 */

// Context and identity
export * from "./context.js";
export * from "./identity/authorize.js";

// Tasks
export * from "./tasks/state.js";
export * from "./tasks/service.js";

// Contracts
export * from "./contracts/compiler.js";
export * from "./contracts/plan-snapshot.js";
export * from "./contracts/service.js";

// Negotiation
export * from "./negotiation/guardrails.js";
export * from "./negotiation/service.js";

// Payments
export * from "./payments/policy.js";
export * from "./payments/service.js";

// Activity projection
export * from "./activity/project.js";
