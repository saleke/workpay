/**
 * Common API schemas shared across resources: ids, money, pagination, error
 * envelopes. Money is always `{ amountMinor, currency }` with an integer.
 */
import { z } from "zod";

export const currencySchema = z.literal("USD");

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    reason: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string().optional(),
});

/** A task id, useful as a path/query parameter. */
export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type MoneyDto = z.infer<typeof moneySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
