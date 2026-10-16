/**
 * Domain event envelope (Component 12). The event catalog in `catalog.ts` is
 * frozen at Gate 0. Changing an event name or payload requires a PR that
 * updates the catalog plus every producer and consumer (ENGINEERING_PLAN 6.1).
 *
 * Events are past-tense facts. They never grant authority; consumers re-check
 * policy before acting, especially payment events.
 */
import type { z } from "zod";

export const AGGREGATE_TYPES = [
  "TASK",
  "WORK_SPEC",
  "CONTRACT",
  "PROVIDER_SELECTION",
  "NEGOTIATION",
  "AGREEMENT",
  "PAYMENT",
  "EXECUTION",
  "SUBMISSION",
  "VERIFICATION",
  "CASE",
  "AGENT",
  "SYSTEM",
] as const;
export type AggregateType = (typeof AGGREGATE_TYPES)[number];

export const ACTOR_TYPES = ["USER", "AGENT", "PROVIDER", "SYSTEM", "PAYPAL", "REVIEWER"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Activity visibility (Component 12). */
export const EVENT_VISIBILITIES = ["USER", "PROVIDER", "ADMIN", "INTERNAL"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export interface EventActor {
  type: ActorType;
  id: string | null;
}

export interface DomainEvent<T = unknown> {
  /** Globally unique event id (evt_...). Consumers dedupe on this. */
  id: string;
  type: string;
  version: number;
  aggregateType: AggregateType;
  aggregateId: string;
  /** The task is the central business entity; every meaningful event carries it. */
  taskId: string;
  occurredAt: string;
  actor: EventActor;
  correlationId: string;
  causationId: string | null;
  payload: T;
}

export interface EventDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  version: number;
  aggregateType: AggregateType;
  visibility: EventVisibility;
  /** One-line human description used by the activity projection. */
  description: string;
  payload: TSchema;
}
