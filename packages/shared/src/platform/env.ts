/**
 * Environment configuration (ENGINEERING_PLAN section 55, Component 18 section 12).
 *
 * Validated with Zod at boot. Missing critical configuration fails fast rather
 * than producing a half-working app. Real integrations (OpenAI, PayPal, S3)
 * are opt-in: when their selector is `fake`/`local`, credentials are not
 * required, which is what keeps CI and the test suite network-free.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** Load the nearest environment files walking up from cwd (monorepo: apps/* -> repo root). */
function loadEnvFiles(): void {
  const nodeEnv = process.env.NODE_ENV;
  const mode =
    nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development";
  const filenames = [
    `.env.${mode}.local`,
    ...(mode !== "test" ? [".env.local"] : []),
    `.env.${mode}`,
    ".env",
  ];
  let dir = process.cwd();
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    for (const filename of filenames) {
      const candidate = resolve(dir, filename);
      if (!seen.has(candidate) && existsSync(candidate)) {
        loadDotenv({ path: candidate });
      }
      seen.add(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase()),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    WORKPAY_MODE: z.enum(["demo", "production"]).default("demo"),
    NEXT_PUBLIC_DEMO_MODE: booleanish.default(true),
    APP_URL: z.string().url().default("http://localhost:3000"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_URL_POOLED: optionalString,

    AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
    AUTH_TRUST_HOST: booleanish.default(true),

    // Existing planning/verification integrations remain independently configured.
    AI_PROVIDER: z.enum(["fake", "openai", "cloudflare"]).default("fake"),
    INTAKE_AI_PROVIDER: z.enum(["disabled", "gateway", "cloudflare"]).default("disabled"),
    AI_GATEWAY_API_KEY: optionalString,
    INTAKE_AI_MODEL: optionalString,
    OPENAI_API_KEY: optionalString,
    OPENAI_BASE_URL: optionalString,
    OPENAI_MODEL: z.string().default("gpt-4o-mini"),
    CLOUDFLARE_ACCOUNT_ID: optionalString,
    CLOUDFLARE_API_TOKEN: optionalString,
    CLOUDFLARE_AI_MODEL: z.string().default("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),

    PAYMENT_GATEWAY: z.enum(["fake", "paypal"]).default("fake"),
    PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_CLIENT_ID: optionalString,
    PAYPAL_CLIENT_SECRET: optionalString,
    PAYPAL_WEBHOOK_ID: optionalString,
    SYSTEM_PAYMENT_PAUSE: booleanish.default(false),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".workpay-storage"),
    S3_ENDPOINT: z.string().default("http://localhost:9000"),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().default("workpay"),
    S3_SECRET_ACCESS_KEY: z.string().default("workpay-secret"),
    S3_BUCKET: z.string().default("workpay-artifacts"),
    S3_FORCE_PATH_STYLE: booleanish.default(true),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    SENTRY_DSN: optionalString,

    // GitHub OAuth
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,

    // Google OAuth (Sign-Up and Login)
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    // Persona Identity Verification (withpersona.com)
    PERSONA_API_KEY: optionalString,
    PERSONA_TEMPLATE_ID: optionalString,
    PERSONA_ENVIRONMENT_ID: optionalString,
    PERSONA_WEBHOOK_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENT_GATEWAY === "paypal") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PAYMENT_GATEWAY"],
        message:
          "Live payments are disabled while the user-led lifecycle is being validated. Use PAYMENT_GATEWAY=fake.",
      });
    }
    if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai",
      });
    }
    if (env.AI_PROVIDER === "cloudflare") {
      if (!env.CLOUDFLARE_ACCOUNT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFLARE_ACCOUNT_ID"],
          message: "CLOUDFLARE_ACCOUNT_ID is required when AI_PROVIDER=cloudflare",
        });
      }
      if (!env.CLOUDFLARE_API_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFLARE_API_TOKEN"],
          message: "CLOUDFLARE_API_TOKEN is required when AI_PROVIDER=cloudflare",
        });
      }
    }
    if (env.INTAKE_AI_PROVIDER === "gateway" && !env.INTAKE_AI_MODEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTAKE_AI_MODEL"],
        message: "INTAKE_AI_MODEL is required when INTAKE_AI_PROVIDER=gateway",
      });
    }
    if (env.INTAKE_AI_PROVIDER === "cloudflare") {
      if (!env.CLOUDFLARE_ACCOUNT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFLARE_ACCOUNT_ID"],
          message: "CLOUDFLARE_ACCOUNT_ID is required when INTAKE_AI_PROVIDER=cloudflare",
        });
      }
      if (!env.CLOUDFLARE_API_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CLOUDFLARE_API_TOKEN"],
          message: "CLOUDFLARE_API_TOKEN is required when INTAKE_AI_PROVIDER=cloudflare",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  loadEnvFiles();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => ` - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: reset the memoized env (e.g. between env-specific tests). */
export function resetEnvCache(): void {
  cached = null;
}
