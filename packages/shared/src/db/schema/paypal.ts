import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { providers } from "./providers";

export const paypalIdentityLinks = pgTable(
  "paypal_identity_links",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    environment: varchar("environment", { length: 16 }).notNull(),
    payerId: varchar("payer_id", { length: 128 }).notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    accountVerified: boolean("account_verified").notNull().default(false),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: varchar("status", { length: 16 }).notNull().default("LINKED"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userEnvironmentIdx: uniqueIndex("paypal_identity_links_user_environment_unique").on(
      t.userId,
      t.environment,
    ),
    payerEnvironmentIdx: uniqueIndex("paypal_identity_links_payer_environment_unique").on(
      t.payerId,
      t.environment,
    ),
    statusCheck: check(
      "paypal_identity_links_status_valid",
      sql`${t.status} in ('LINKED', 'REVOKED')`,
    ),
    environmentCheck: check(
      "paypal_identity_links_environment_valid",
      sql`${t.environment} in ('SANDBOX', 'LIVE')`,
    ),
  }),
);

export const paypalOauthAttempts = pgTable(
  "paypal_oauth_attempts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    environment: varchar("environment", { length: 16 }).notNull(),
    stateHash: varchar("state_hash", { length: 64 }).notNull(),
    sessionTokenHash: varchar("session_token_hash", { length: 64 }).notNull(),
    returnTo: text("return_to").notNull().default("/settings?tab=paypal"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: uniqueIndex("paypal_oauth_attempts_state_unique").on(t.stateHash),
    userIdx: index("paypal_oauth_attempts_user_idx").on(t.userId, t.createdAt),
    environmentCheck: check(
      "paypal_oauth_attempts_environment_valid",
      sql`${t.environment} in ('SANDBOX', 'LIVE')`,
    ),
  }),
);

export const providerPaypalAccounts = pgTable(
  "provider_paypal_accounts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    environment: varchar("environment", { length: 16 }).notNull(),
    trackingId: varchar("tracking_id", { length: 128 }).notNull(),
    referralId: varchar("referral_id", { length: 128 }),
    merchantId: varchar("merchant_id", { length: 128 }),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"),
    paymentsReceivable: boolean("payments_receivable").notNull().default(false),
    primaryEmailConfirmed: boolean("primary_email_confirmed").notNull().default(false),
    consentStatus: boolean("consent_status").notNull().default(false),
    products: jsonb("products").notNull().default([]),
    permissions: jsonb("permissions").notNull().default([]),
    actionUrl: text("action_url"),
    onboardingStateHash: varchar("onboarding_state_hash", { length: 64 }),
    onboardingExpiresAt: timestamp("onboarding_expires_at", { withTimezone: true }),
    onboardingConsumedAt: timestamp("onboarding_consumed_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerEnvironmentIdx: uniqueIndex("provider_paypal_accounts_provider_environment_unique").on(
      t.providerId,
      t.environment,
    ),
    trackingEnvironmentIdx: uniqueIndex("provider_paypal_accounts_tracking_environment_unique").on(
      t.trackingId,
      t.environment,
    ),
    merchantEnvironmentIdx: uniqueIndex("provider_paypal_accounts_merchant_environment_unique").on(
      t.merchantId,
      t.environment,
    ),
    statusIdx: index("provider_paypal_accounts_status_idx").on(t.status, t.updatedAt),
    statusCheck: check(
      "provider_paypal_accounts_status_valid",
      sql`${t.status} in ('PENDING', 'ACTIVE', 'RESTRICTED', 'REVOKED')`,
    ),
    environmentCheck: check(
      "provider_paypal_accounts_environment_valid",
      sql`${t.environment} in ('SANDBOX', 'LIVE')`,
    ),
  }),
);

export const paypalIdentityLinksRelations = relations(paypalIdentityLinks, ({ one }) => ({
  user: one(users, { fields: [paypalIdentityLinks.userId], references: [users.id] }),
}));

export const providerPaypalAccountsRelations = relations(providerPaypalAccounts, ({ one }) => ({
  provider: one(providers, {
    fields: [providerPaypalAccounts.providerId],
    references: [providers.id],
  }),
  user: one(users, { fields: [providerPaypalAccounts.userId], references: [users.id] }),
}));
