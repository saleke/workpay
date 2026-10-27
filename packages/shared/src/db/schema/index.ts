/**
 * Schema barrel. Import domain tables from here to keep module code decoupled
 * from file layout. Table names follow Component 19's authoritative data model
 * so the two engineers share one mental model of the database.
 */
export * from "./identity";
export * from "./tasks";
export * from "./contracts";
export * from "./providers";
export * from "./negotiation";
export * from "./payments";
export * from "./execution";
export * from "./verification";
export * from "./cases";
export * from "./agent";
export * from "./intake";
export * from "./infra";

// Re-export the enum definitions. Drizzle Kit discovers enum types from the
// schema module graph; because column definitions reference these enums, they
// must be reachable from the entry file for migrations to emit CREATE TYPE.
export * from "../enums";
