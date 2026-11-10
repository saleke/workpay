/**
 * Identity tables (Component 2 + Auth.js Drizzle adapter).
 *
 * Auth.js owns `users`, `accounts`, `sessions`, `verificationTokens`. WorkPay
 * extends `users` with a role. The database is the authority for identity:
 * `authorize()` reads roles from here, never from the session token payload.
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { accountClassEnum, userRoleEnum } from "../enums";

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: text("name"),
    username: varchar("username", { length: 32 }),
    displayName: text("display_name"),
    legalName: text("legal_name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("buyer"),
    accountClass: accountClassEnum("account_class").notNull().default("UNCLASSIFIED"),
    // Step 2: Developer verification (GitHub profile)
    githubUsername: text("github_username"),
    githubVerifiedAt: timestamp("github_verified_at", { withTimezone: true }),
    // Persona-reported identity verification outcome and source.
    idVerificationStatus: varchar("id_verification_status", { length: 32 })
      .notNull()
      .default("UNVERIFIED"),
    idVerificationProvider: varchar("id_verification_provider", { length: 32 }),
    idVerifiedAt: timestamp("id_verified_at", { withTimezone: true }),
    idDocumentType: varchar("id_document_type", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_unique").on(t.email),
    usernameIdx: uniqueIndex("users_username_unique").on(t.username),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: varchar("token_type", { length: 64 }),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    handoffCodeHash: varchar("handoff_code_hash", { length: 64 }),
    handoffTabNonceHash: varchar("handoff_tab_nonce_hash", { length: 64 }),
    handoffExpiresAt: timestamp("handoff_expires_at", { withTimezone: true }),
  },
  (t) => ({
    handoffCodeIdx: uniqueIndex("sessions_handoff_code_hash_unique").on(t.handoffCodeHash),
  }),
);

export const oauthAttempts = pgTable(
  "oauth_attempts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 16 }).notNull(),
    stateHash: varchar("state_hash", { length: 64 }).notNull(),
    intent: varchar("intent", { length: 16 }).notNull(),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, {
      onDelete: "cascade",
    }),
    tabNonceHash: varchar("tab_nonce_hash", { length: 64 }).notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stateIdx: uniqueIndex("oauth_attempts_state_hash_unique").on(t.stateHash),
    userIdx: index("oauth_attempts_user_idx").on(t.userId, t.createdAt),
    providerCheck: check(
      "oauth_attempts_provider_valid",
      sql`${t.provider} in ('GOOGLE', 'GITHUB')`,
    ),
    intentCheck: check("oauth_attempts_intent_valid", sql`${t.intent} in ('SIGN_IN', 'LINK')`),
  }),
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
