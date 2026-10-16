/**
 * Transactional outbox writer (Component 12, invariant D1).
 *
 * `appendEvent` must be called with the same transaction handle that wrote the
 * business state. It validates the payload against the frozen catalog, writes
 * the immutable `events` row, and enqueues an `outbox_events` row. The
 * publisher later dispatches outbox rows to consumers.
 *
 * Why this shape: if the process dies after the business write but before the
 * event is dispatched, the outbox row survives and is retried. If the event
 * write fails, the business transaction rolls back with it. The two can never
 * disagree.
 */
import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { z } from "zod";
import { events, outboxEvents } from "../db/schema/infra.js";
import type * as schema from "../db/schema/index.js";
import { newId } from "../platform/ids.js";
import { logger } from "../platform/logger.js";
import { eventCatalog, type EventType } from "./catalog.js";
import type { ActorType, DomainEvent, EventActor, EventVisibility } from "./envelope.js";

type AnyDb = NodePgDatabase<typeof schema>;

export interface AppendEventInput<T extends EventType = EventType> {
  type: T;
  aggregateId: string;
  taskId: string;
  /** Event payload. Validated against the catalog schema before it is stored. */
  payload: z.input<(typeof eventCatalog)[T]["payload"]>;
  actor: EventActor;
  correlationId: string;
  causationId?: string | null;
  occurredAt?: Date;
}

/**
 * Validate, then write the event and its outbox row inside the caller's
 * transaction. Returns the stored `DomainEvent`.
 *
 * Passing a transaction handle is mandatory at call sites: this function does
 * not open its own transaction, precisely so the caller controls atomicity.
 */
export async function appendEvent<T extends EventType>(
  tx: AnyDb,
  input: AppendEventInput<T>,
): Promise<DomainEvent> {
  const definition = eventCatalog[input.type];
  const parsed = definition.payload.safeParse(input.payload);
  if (!parsed.success) {
    throw new Error(
      `Invalid payload for ${input.type}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
        .join("; ")}`,
    );
  }

  const occurredAt = input.occurredAt ?? new Date();
  const id = newId("evt");
  const visibility = definition.visibility as EventVisibility;
  const actorType = input.actor.type as ActorType;

  const event: DomainEvent = {
    id,
    type: input.type,
    version: definition.version,
    aggregateType: definition.aggregateType,
    aggregateId: input.aggregateId,
    taskId: input.taskId,
    occurredAt: occurredAt.toISOString(),
    actor: input.actor,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    payload: parsed.data,
  };

  await tx.insert(events).values({
    id,
    type: event.type,
    version: event.version,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    taskId: event.taskId,
    actorType,
    actorId: input.actor.id,
    correlationId: event.correlationId,
    causationId: event.causationId,
    visibility,
    payload: event.payload as Record<string, unknown>,
    occurredAt,
  });

  await tx.insert(outboxEvents).values({
    id: newId("job"),
    eventId: id,
    eventType: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    taskId: event.taskId,
  });

  logger.debug({ eventType: event.type, eventId: id, taskId: event.taskId }, "event appended");

  return event;
}

/**
 * Claim a batch of pending outbox rows for dispatch. Uses `FOR UPDATE SKIP
 * LOCKED` so multiple publishers (or a restarted worker) never process the same
 * row twice. Callers must pass the transaction that will mark rows published.
 */
export async function claimOutboxBatch(tx: AnyDb, limit = 50) {
  const rows = await tx
    .select()
    .from(outboxEvents)
    .where(
      and(eq(outboxEvents.status, "PENDING"), lte(outboxEvents.availableAt, sql`now()`)),
    )
    .orderBy(asc(outboxEvents.createdAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  return rows;
}

export async function markOutboxPublished(tx: AnyDb, outboxId: string): Promise<void> {
  await tx
    .update(outboxEvents)
    .set({ status: "COMPLETED", publishedAt: sql`now()` })
    .where(eq(outboxEvents.id, outboxId));
}

export async function markOutboxFailed(
  tx: AnyDb,
  outboxId: string,
  error: string,
  maxAttempts = 5,
): Promise<void> {
  const [row] = await tx
    .select({ attempts: outboxEvents.attempts })
    .from(outboxEvents)
    .where(eq(outboxEvents.id, outboxId))
    .limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  const dead = attempts >= maxAttempts;
  // Exponential backoff with a cap, so a poisoned event does not hot-loop.
  const backoffSeconds = Math.min(2 ** attempts * 5, 900);
  await tx
    .update(outboxEvents)
    .set({
      attempts,
      lastError: error.slice(0, 2000),
      status: dead ? "DEAD_LETTER" : "PENDING",
      availableAt: dead
        ? sql`now()`
        : sql`now() + (${backoffSeconds} * interval '1 second')`,
    })
    .where(eq(outboxEvents.id, outboxId));
}
