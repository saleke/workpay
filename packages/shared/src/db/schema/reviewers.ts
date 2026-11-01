/**
 * Optional, independent reviewer marketplace profiles.
 *
 * Profile and evidence claims are supplied by the reviewer; WorkPay does not
 * verify them or use them as a quality verdict.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const reviewerProfiles = pgTable(
  "reviewer_profiles",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    publicContactUrl: text("public_contact_url"),
    isListed: boolean("is_listed").notNull().default(false),
    available: boolean("available").notNull().default(true),
    summary: text("summary").notNull(),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`ARRAY['English']::text[]`),
    feeMinor: bigint("fee_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    typicalTurnaroundDays: integer("typical_turnaround_days"),
    conflictDisclosureConfirmed: boolean("conflict_disclosure_confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("reviewer_profiles_user_unique").on(table.userId),
    listedIdx: index("reviewer_profiles_listed_available_idx").on(table.isListed, table.available),
    feeCheck: check(
      "reviewer_profiles_fee_nonnegative",
      sql`${table.feeMinor} is null or (${table.feeMinor} >= 0 and ${table.feeMinor} <= 9007199254740991)`,
    ),
    currencyCheck: check("reviewer_profiles_currency_usd", sql`${table.currency} = 'USD'`),
    turnaroundCheck: check(
      "reviewer_profiles_turnaround_positive",
      sql`${table.typicalTurnaroundDays} is null or ${table.typicalTurnaroundDays} > 0`,
    ),
    listingDisclosureCheck: check(
      "reviewer_profiles_listing_requires_disclosure",
      sql`${table.isListed} = false or ${table.conflictDisclosureConfirmed} = true`,
    ),
  }),
);

export const reviewerExpertise = pgTable(
  "reviewer_expertise",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    profileId: varchar("profile_id", { length: 64 })
      .notNull()
      .references(() => reviewerProfiles.id, { onDelete: "cascade" }),
    domainTag: varchar("domain_tag", { length: 128 }).notNull(),
    scope: text("scope").notNull(),
    selfAssessedLevel: integer("self_assessed_level").notNull().default(3),
    yearsExperience: integer("years_experience"),
    methods: text("methods")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainUnique: uniqueIndex("reviewer_expertise_profile_domain_unique").on(
      table.profileId,
      table.domainTag,
    ),
    domainIdx: index("reviewer_expertise_domain_idx").on(table.domainTag),
    levelCheck: check(
      "reviewer_expertise_level_range",
      sql`${table.selfAssessedLevel} between 1 and 5`,
    ),
    yearsCheck: check(
      "reviewer_expertise_years_nonnegative",
      sql`${table.yearsExperience} is null or ${table.yearsExperience} >= 0`,
    ),
  }),
);

export const reviewerEvidence = pgTable(
  "reviewer_evidence",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    profileId: varchar("profile_id", { length: 64 })
      .notNull()
      .references(() => reviewerProfiles.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 24 }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    url: text("url"),
    issuer: text("issuer"),
    provenance: varchar("provenance", { length: 24 }).notNull().default("REVIEWER_SUPPLIED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    profileIdx: index("reviewer_evidence_profile_idx").on(table.profileId),
    kindCheck: check(
      "reviewer_evidence_kind_valid",
      sql`${table.kind} in ('PORTFOLIO', 'CREDENTIAL', 'EXPERIENCE', 'REFERENCE')`,
    ),
    provenanceCheck: check(
      "reviewer_evidence_provenance_unverified",
      sql`${table.provenance} = 'REVIEWER_SUPPLIED'`,
    ),
  }),
);

export const reviewerConflicts = pgTable(
  "reviewer_conflicts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    profileId: varchar("profile_id", { length: 64 })
      .notNull()
      .references(() => reviewerProfiles.id, { onDelete: "cascade" }),
    conflictedUserId: varchar("conflicted_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("reviewer_conflicts_profile_user_unique").on(
      table.profileId,
      table.conflictedUserId,
    ),
    conflictedUserIdx: index("reviewer_conflicts_user_idx").on(table.conflictedUserId),
  }),
);

export const reviewerProfilesRelations = relations(reviewerProfiles, ({ one, many }) => ({
  user: one(users, { fields: [reviewerProfiles.userId], references: [users.id] }),
  expertise: many(reviewerExpertise),
  evidence: many(reviewerEvidence),
  conflicts: many(reviewerConflicts),
}));

export const reviewerExpertiseRelations = relations(reviewerExpertise, ({ one }) => ({
  profile: one(reviewerProfiles, {
    fields: [reviewerExpertise.profileId],
    references: [reviewerProfiles.id],
  }),
}));

export const reviewerEvidenceRelations = relations(reviewerEvidence, ({ one }) => ({
  profile: one(reviewerProfiles, {
    fields: [reviewerEvidence.profileId],
    references: [reviewerProfiles.id],
  }),
}));

export const reviewerConflictsRelations = relations(reviewerConflicts, ({ one }) => ({
  profile: one(reviewerProfiles, {
    fields: [reviewerConflicts.profileId],
    references: [reviewerProfiles.id],
  }),
  conflictedUser: one(users, {
    fields: [reviewerConflicts.conflictedUserId],
    references: [users.id],
  }),
}));
