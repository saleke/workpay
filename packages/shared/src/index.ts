/**
 * Client-safe entry for `@workpay/shared`.
 *
 * Anything exported here must be safe to bundle into the browser: pure
 * functions and types only. Server-only code (database, hashing, logging,
 * environment, outbox) lives behind the explicit subpaths `./platform`,
 * `./db`, `./events`, `./integrations`, `./schemas`, `./domain`, `./testing`.
 *
 * Keeping the browser surface small is a security control: it makes it hard to
 * accidentally import a Node module or a server secret into a client
 * component.
 */
export * from "./platform/money.js";
export * from "./platform/ids.js";
export * from "./platform/errors.js";
export type { DomainEvent, AggregateType, ActorType, EventVisibility } from "./events/envelope.js";
