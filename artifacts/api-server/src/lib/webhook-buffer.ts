/**
 * In-memory webhook event buffer.
 *
 * When the database is unavailable during webhook ingestion we accept the event
 * from the provider (return HTTP 200) and store it here so it can be replayed
 * once the DB recovers.  This prevents payment providers from exhausting their
 * retry budgets during a brief outage.
 *
 * Design decisions:
 * - Bounded at MAX_BUFFER_SIZE events (ring buffer — oldest dropped on overflow).
 * - Each entry carries a `process()` closure that re-runs the full pipeline
 *   (log → business-logic → mark processed) so the drainer is provider-agnostic.
 * - Drains every DRAIN_INTERVAL_MS.  Successfully drained events are removed;
 *   events that still fail stay in the queue for the next cycle.
 * - Slack alerts fire when buffering starts, on overflow, and when the queue drains.
 */

import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";

const WEBHOOK_BUFFER_JOB_NAME = "webhook-buffer-drainer";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueuedWebhookEvent = {
  eventId: string;
  provider: string;
  eventType: string;
  /** Full replay pipeline: log to DB + business logic + mark processed. */
  process: () => Promise<void>;
  queuedAt: Date;
  attempts: number;
};

// ── Configuration ─────────────────────────────────────────────────────────────

const MAX_BUFFER_SIZE  = 500;
export const DRAIN_INTERVAL_MS = 30_000; // 30 seconds

// ── State ─────────────────────────────────────────────────────────────────────

let buffer: QueuedWebhookEvent[] = [];
let drainerStarted = false;

/** Pluggable Slack alerter — set via registerSlackAlerter() during startup. */
let _slack: ((msg: string) => Promise<void>) | null = null;

export function registerSlackAlerter(fn: (msg: string) => Promise<void>): void {
  _slack = fn;
}

function slack(msg: string): void {
  _slack?.(msg).catch((e) => logger.error({ e }, "[webhook-buffer] Slack alert failed"));
}

// ── Buffer API ────────────────────────────────────────────────────────────────

/**
 * Add an event to the buffer.  If the buffer is full the oldest event is
 * dropped (with a Slack alert) to keep memory bounded.
 */
// Coalesce overflow alerts — at most one per minute to avoid alert storms
let _lastOverflowAlertAt = 0;
const OVERFLOW_ALERT_COOLDOWN_MS = 60_000;

export function enqueueWebhookEvent(
  event: Omit<QueuedWebhookEvent, "queuedAt" | "attempts">,
): void {
  if (buffer.length >= MAX_BUFFER_SIZE) {
    const dropped = buffer.shift()!;
    logger.error({ droppedEventId: dropped.eventId }, "[webhook-buffer] OVERFLOW — event dropped");
    const now = Date.now();
    if (now - _lastOverflowAlertAt > OVERFLOW_ALERT_COOLDOWN_MS) {
      _lastOverflowAlertAt = now;
      slack(
        `⚠️ *Webhook buffer overflow* — oldest event dropped to stay within limit.\n` +
        `• Dropped: \`${dropped.eventId}\` (${dropped.provider} / ${dropped.eventType})\n` +
        `• Buffer cap: ${MAX_BUFFER_SIZE} events`,
      );
    }
  }

  const wasEmpty = buffer.length === 0;
  buffer.push({ ...event, queuedAt: new Date(), attempts: 0 });

  logger.warn(
    { eventId: event.eventId, provider: event.provider, bufferSize: buffer.length },
    "[webhook-buffer] Event queued (DB unavailable)",
  );

  // Alert once when buffering begins so ops know about the DB issue
  if (wasEmpty) {
    slack(
      `🟡 *Webhook buffer activated* — DB appears unavailable.\n` +
      `• First queued event: \`${event.eventId}\` (${event.provider} / ${event.eventType})\n` +
      `• Events will be replayed automatically when the DB recovers.`,
    );
  }
}

export function getBufferSize(): number {
  return buffer.length;
}

// ── Drainer ───────────────────────────────────────────────────────────────────

async function drain(): Promise<void> {
  if (buffer.length === 0) return;

  const batchSize = buffer.length;
  logger.info({ batchSize }, "[webhook-buffer] Draining buffered events");

  const remaining: QueuedWebhookEvent[] = [];

  for (const item of buffer) {
    try {
      await item.process();
      logger.info(
        { eventId: item.eventId, attempts: item.attempts + 1 },
        "[webhook-buffer] Event successfully drained",
      );
    } catch (err) {
      item.attempts++;
      remaining.push(item);
      logger.warn(
        { eventId: item.eventId, attempts: item.attempts, err },
        "[webhook-buffer] Event drain failed — will retry",
      );
    }
  }

  const drainedCount = batchSize - remaining.length;
  buffer = remaining;

  if (drainedCount > 0) {
    const msg =
      `✅ *Webhook buffer drained* — ${drainedCount} event(s) replayed after DB recovery.` +
      (remaining.length > 0
        ? `\n• ${remaining.length} event(s) still pending (DB may still be degraded).`
        : "");
    logger.info({ drainedCount, stillPending: remaining.length }, "[webhook-buffer] Drain complete");
    slack(msg);
  }

  // Record the drain outcome in the admin Background Jobs panel so admins can
  // see that the drainer is alive and whether it is successfully clearing events.
  await recordJobRun(WEBHOOK_BUFFER_JOB_NAME, {
    success: remaining.length === 0 || drainedCount > 0,
    checkedCount: batchSize,
    affectedCount: drainedCount,
    error: remaining.length > 0 && drainedCount === 0
      ? `${remaining.length} event(s) stuck — DB may still be degraded`
      : undefined,
  }).catch(() => {}); // never let recordJobRun failure interrupt the drain cycle
}

/**
 * Start the background drainer.  Safe to call multiple times — only one
 * drainer is ever started per process.
 */
export function startWebhookBufferDrainer(): void {
  if (drainerStarted) return;
  drainerStarted = true;
  setInterval(
    () => { drain().catch((e) => logger.error({ e }, "[webhook-buffer] Drain cycle error")); },
    DRAIN_INTERVAL_MS,
  );
  logger.info(
    { intervalSeconds: DRAIN_INTERVAL_MS / 1000 },
    "[webhook-buffer] Drainer started",
  );
}
