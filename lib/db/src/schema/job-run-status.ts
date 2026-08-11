import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Tracks the health of unattended periodic background jobs (e.g. the
 * subscription-sync scheduler) so admins aren't flying blind if a job stops
 * running, starts erroring, or simply never finds anything to do. One row
 * per job, upserted on every tick — mirrors the "last checked / currently
 * failing" bookkeeping already used for platform gateway health checks
 * (see platform_payment_credentials.failingSince).
 */
export const jobRunStatusTable = pgTable("job_run_status", {
  id: serial("id").primaryKey(),
  jobName: text("job_name").notNull().unique("job_run_status_job_name_key"), // e.g. "subscription-sync"
  lastRunAt: timestamp("last_run_at", { withTimezone: true }), // set on every tick, pass or fail
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }), // set only when a tick completes without throwing
  lastCheckedCount: integer("last_checked_count"), // items examined on the last successful run
  lastAffectedCount: integer("last_affected_count"), // items actually changed on the last successful run
  lastError: text("last_error"), // null while healthy; message from the most recent failed tick
  // Consecutive failed ticks in a row. Reset to 0 on any successful tick.
  // Used to distinguish one transient blip from a job that's actually stuck.
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type JobRunStatus = typeof jobRunStatusTable.$inferSelect;
