/**
 * AI adapter factory. Selection is driven by configuration, and the fake
 * adapter is the default so nothing reaches the network unless it is asked to.
 */
import { AppError } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";
import { FakeAI } from "./fake.js";
import { OpenAIAI } from "./openai.js";
import type { AIClient } from "./types.js";

let cached: AIClient | null = null;

export function getAIClient(): AIClient {
  if (cached) return cached;
  const env = getEnv();
  if (env.AI_PROVIDER === "fake") {
    cached = new FakeAI();
    return cached;
  }
  if (!env.OPENAI_API_KEY) {
    throw new AppError("VALIDATION_ERROR", "OPENAI_API_KEY is required when AI_PROVIDER=openai");
  }
  cached = new OpenAIAI({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
  });
  return cached;
}

/** Test helper: inject a specific adapter. */
export function setAIClient(client: AIClient | null): void {
  cached = client;
}

export * from "./types.js";
export { FakeAI } from "./fake.js";
export { OpenAIAI } from "./openai.js";
