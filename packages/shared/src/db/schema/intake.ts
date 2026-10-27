import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { IntakeVersion } from "../../domain/intake/model";
import { users } from "./identity";

export const intakeSessions = pgTable(
  "intake_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalRequest: text("original_request").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerUpdatedIdx: index("intake_sessions_owner_updated_idx").on(table.userId, table.updatedAt),
    versionCheck: check("intake_sessions_version_positive", sql`${table.currentVersion} > 0`),
    statusCheck: check(
      "intake_sessions_status_valid",
      sql`${table.status} in ('DRAFT', 'READY', 'APPROVED')`,
    ),
    approvalCheck: check(
      "intake_sessions_approval_consistent",
      sql`(${table.status} = 'APPROVED') = (${table.approvedAt} is not null)`,
    ),
  }),
);

export const intakeVersions = pgTable(
  "intake_versions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sessionId: varchar("session_id", { length: 64 })
      .notNull()
      .references(() => intakeSessions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<IntakeVersion>().notNull(),
    createdBy: varchar("created_by", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionVersionUnique: uniqueIndex("intake_versions_session_version_unique").on(
      table.sessionId,
      table.version,
    ),
    sessionCreatedIdx: index("intake_versions_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    versionCheck: check("intake_versions_version_positive", sql`${table.version} > 0`),
  }),
);

export const intakeSessionsRelations = relations(intakeSessions, ({ one, many }) => ({
  user: one(users, { fields: [intakeSessions.userId], references: [users.id] }),
  versions: many(intakeVersions),
}));

export const intakeVersionsRelations = relations(intakeVersions, ({ one }) => ({
  session: one(intakeSessions, {
    fields: [intakeVersions.sessionId],
    references: [intakeSessions.id],
  }),
  creator: one(users, { fields: [intakeVersions.createdBy], references: [users.id] }),
}));
