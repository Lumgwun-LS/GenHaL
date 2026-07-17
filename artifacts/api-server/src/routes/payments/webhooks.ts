/**
 * Webhook-only router — public, no auth required.
 * Signature verification is done inside each handler.
 * Mounted BEFORE requireAuth in routes/index.ts.
 *
 * DB-outage resilience:
 * When the database is unreachable the route returns HTTP 200 (so the provider
 * does not retry) and queues the event in the in-memory webhook buffer.  A
 * background drainer replays buffered events every 30 s until the DB recovers.
 *
 * Concurrent-delivery safety:
 * Each event is claimed via an in-progress sentinel set atomically during INSERT
 * (first delivery) or via a single atomic UPDATE … RETURNING (retry path).
 * Timed-out sentinels (handler crashed mid-run) are reset by the background
 * stale-sentinel cleanup so future retries can reclaim the event.
 */
import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, vendorsTable, webhookEventsTable, vendorNotificationsTable, vendorAddonCreditsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendSlackAlert } from "../../lib/slack";
import {
  enqueueWebhookEvent,
  registerSlackAlerter,
} from "../../lib/webhook-buffer";
import { resolveGatewayField } from "../../lib/platform-gateways";
import { syncSaleFromPayment } from "../../lib/sales-sync";
import { notifyVendorPaymentStatus } from "../../lib/push";
import { sendEmail } from "../../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../../lib/email-branding";
import { getSubscriptionPlan } from "../../lib/subscription-plans";
import { insertTierChangeNotification, sendSubscriptionCancelledEmail } from "../../lib/subscription-notifications";

const router = Router();

/** Rank used only to decide "upgrade" vs "downgrade" wording in the notice. */
const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

/** Sends the vendor an email when their plan changes tier via the Customer Portal (upgrade or downgrade). */
async function sendSubscriptionChangedEmail(
  email: string,
  vendorName: string,
  previousTier: string,
  newTier: string,
): Promise<void> {
  const isUpgrade = (TIER_RANK[newTier] ?? 0) > (TIER_RANK[previousTier] ?? 0);
  const [newPlan, lostPlan] = await Promise.all([getSubscriptionPlan(newTier), getSubscriptionPlan(previousTier)]);

  const featuresHtml = isUpgrade
    ? newPlan
      ? `
        <p style="font-size: 14px; line-height: 1.6; color: #444;">You now have access to ${escapeHtml(newPlan.name)} features, including:</p>
        <ul style="font-size: 14px; line-height: 1.8; color: #444; padding-left: 20px;">
          ${newPlan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
        </ul>`
      : ""
    : lostPlan
      ? `
        <p style="font-size: 14px; line-height: 1.6; color: #444;">You'll no longer have access to ${escapeHtml(lostPlan.name)} features, including:</p>
        <ul style="font-size: 14px; line-height: 1.8; color: #444; padding-left: 20px;">
          ${lostPlan.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
        </ul>`
      : "";

  const newPlanName = newPlan?.name ?? newTier;
  const previousPlanName = lostPlan?.name ?? previousTier;

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your plan has changed</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendorName)}, your VendorHub subscription was switched from ${escapeHtml(previousPlanName)} to ${escapeHtml(newPlanName)} via the billing portal.
      </p>
      ${featuresHtml}
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        You can manage your plan at any time from your dashboard.
      </p>`,
  });

  const result = await sendEmail({ to: email, subject: "Your VendorHub plan has changed", html });
  if (result.status !== "sent") {
    console.warn(`[stripe webhook] subscription plan-change email did not send — reason=${result.error}`);
  }
}

// Wire Slack into the buffer so it can send alerts on DB outage / recovery
registerSlackAlerter(sendSlackAlert);

// ── DB-outage detection ───────────────────────────────────────────────────────

function isDbUnavailableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = (err as { code?: string }).code ?? "";

  if (["econnrefused", "econnreset", "etimedout", "enotfound", "epipe", "ehostunreach"].includes(code.toLowerCase())) return true;
  if (["08000", "08006", "08001", "08004", "57p01", "53300", "57014"].includes(code)) return true;
  if (
    msg.includes("connection terminated") ||
    msg.includes("connection closed") ||
    msg.includes("connection refused") ||
    msg.includes("server closed the connection unexpectedly") ||
    msg.includes("cannot read from a closed connection") ||
    msg.includes("query read timeout") ||
    msg.includes("connect etimedout") ||
    msg.includes("connect econnrefused") ||
    msg.includes("getaddrinfo") ||
    msg.includes("too many connections") ||
    msg.includes("the database system is shut") ||
    msg.includes("the database system is starting up") ||
    msg.includes("connection is closed") ||
    msg.includes("socket hang up") ||
    msg.includes("pool is draining") ||
    msg.includes("client checkout timed out")
  ) return true;
  return false;
}

// ── In-progress sentinel ──────────────────────────────────────────────────────

/**
 * Sentinels older than this are considered stale (handler crashed mid-run).
 * The background checker resets them so future retries can reclaim the event.
 */
const IN_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function makeSentinel(): string {
  return `[in-progress:${Date.now()}]`;
}

function isSentinel(s: string | null | undefined): boolean {
  return typeof s === "string" && s.startsWith("[in-progress:");
}

function isSentinelTimedOut(s: string): boolean {
  const match = s.match(/^\[in-progress:(\d+)\]$/);
  if (!match) return true; // malformed → treat as timed-out so it can be reclaimed
  return Date.now() - Number(match[1]) > IN_PROGRESS_TIMEOUT_MS;
}

// ── Core DB helpers ───────────────────────────────────────────────────────────

/**
 * Persist a webhook event and return whether this event should be skipped.
 *
 * Ownership model (prevents concurrent double-processing):
 *
 *  First delivery:
 *    INSERT sets errorMessage = "[in-progress:ts]" atomically.  A concurrent
 *    duplicate hitting the unique constraint sees the sentinel in the atomic
 *    UPDATE claim below, gets 0 RETURNING rows → isDuplicate=true.
 *
 *  Retry (unique constraint hit):
 *    A single atomic UPDATE … WHERE … RETURNING claims the row.  Two
 *    concurrent retries race on the same SQL; the DB row-lock serialises them
 *    and only one gets RETURNING rows > 0.
 *
 *    Claimable conditions (all checked in the single UPDATE):
 *      • processedAt IS NULL  — not yet successfully processed
 *      • errorMessage IS NULL OR NOT a live sentinel (real error → ready retry)
 *
 *    Timed-out sentinels are reset to NULL by checkStaleWebhookEvents, so by
 *    the time this UPDATE runs any claimable timed-out sentinel has been cleared.
 *
 *  Success: markWebhookProcessed sets processedAt + clears errorMessage.
 *  Failure: markWebhookFailed overwrites sentinel with real error (re-claimable).
 *
 * Throws on DB connectivity errors — callers must catch and buffer.
 */
async function logWebhookEvent(opts: {
  provider: string;
  eventType: string;
  eventId: string;
  reference: string | null;
  rawPayload: unknown;
}): Promise<{ isDuplicate: boolean }> {
  const sentinel = makeSentinel();

  try {
    // Sentinel written during INSERT — ownership established with no gap.
    await db.insert(webhookEventsTable).values({
      provider:     opts.provider,
      eventType:    opts.eventType,
      eventId:      opts.eventId,
      reference:    opts.reference,
      rawPayload:   opts.rawPayload as Record<string, unknown>,
      errorMessage: sentinel,
      // processedAt omitted — set only after business logic succeeds
    });
    return { isDuplicate: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;

    // SQLSTATE 23505 = unique_violation; message fallback for driver variants
    const isUniqueViolation =
      code === "23505" ||
      msg.includes("webhook_events_event_id_unique") ||
      msg.includes("unique constraint");

    if (!isUniqueViolation) {
      throw err; // genuine DB connectivity error — caller will buffer
    }

    // ── Unique constraint hit: event already exists ──
    //
    // Atomic compare-and-set claim: the UPDATE's WHERE clause atomically
    // checks all preconditions in a single SQL statement.  Two concurrent
    // retries both issue this UPDATE; the DB row-lock ensures only one gets
    // RETURNING rows > 0.  The other sees 0 rows → isDuplicate=true.
    //
    // Claimable when processedAt IS NULL (not yet processed) AND errorMessage
    // is either NULL (markWebhookFailed couldn't write during a DB outage) or
    // a real error string (not a live sentinel).  Both cases are retryable.
    //
    // We do NOT try to parse/compare sentinel timestamps in SQL to avoid
    // complex CAST/REGEX expressions.  Instead the background checker resets
    // timed-out sentinels to NULL, making this simple predicate sufficient.
    const claimed = await db
      .update(webhookEventsTable)
      .set({ errorMessage: sentinel })
      .where(
        sql`
          ${webhookEventsTable.eventId} = ${opts.eventId}
          AND ${webhookEventsTable.processedAt} IS NULL
          AND (
            ${webhookEventsTable.errorMessage} IS NULL
            OR ${webhookEventsTable.errorMessage} NOT LIKE '[in-progress:%'
          )
        `,
      )
      .returning({ id: webhookEventsTable.id });

    if (claimed.length === 0) {
      console.warn(`[webhook] duplicate or in-progress event — skipping — id=${opts.eventId}`);
      return { isDuplicate: true };
    }

    console.info(`[webhook] retrying unprocessed event (atomic claim) — id=${opts.eventId}`);
    return { isDuplicate: false };
  }
}

/** Mark a webhook event as successfully processed. Clears any in-progress sentinel. */
async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEventsTable)
    .set({ processedAt: new Date(), errorMessage: null })
    .where(eq(webhookEventsTable.eventId, eventId));
}

/** Store an error on a webhook event row and fire a Slack alert. */
async function markWebhookFailed(
  eventId: string,
  provider: string,
  eventType: string,
  err: unknown,
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);

  try {
    await db
      .update(webhookEventsTable)
      .set({ errorMessage })
      .where(eq(webhookEventsTable.eventId, eventId));
  } catch (dbErr) {
    console.error("[webhook] Failed to persist error_message to DB:", dbErr);
  }

  await sendSlackAlert(
    `🚨 *Webhook processing failed*\n` +
    `• Provider: \`${provider}\`\n` +
    `• Event type: \`${eventType}\`\n` +
    `• Event ID: \`${eventId}\`\n` +
    `• Error: ${errorMessage}`,
  );
}

// ── Shared business logic (used by live webhooks and admin retry) ────────────

type PaymentUpdateOutcome =
  | { outcome: "not_found" }
  | { outcome: "conflict" }
  | {
      outcome: "updated";
      payment: { vendorId: number; amount: string; currency: string; orderId: number | null };
    };

/**
 * Transitions a payment's status via providerReference, but refuses to resurrect a
 * payment the vendor has already cancelled (see POST /external/payments/:id/cancel
 * and /:id/retry, which mark a payment "cancelled" without touching the provider's
 * checkout session). Without this guard, a customer completing payment on a stale
 * link after the vendor cancelled or retried it would silently flip the row back to
 * "paid" — contradicting the vendor's action and risking double-crediting an order
 * that already has a successful retry payment.
 *
 * On conflict: the "cancelled" status is preserved, the attempted transition is
 * recorded on the row's metadata for audit/admin review, and a Slack alert fires.
 * The caller should still treat this as `matched: true` for the webhook pipeline
 * (the event WAS handled — deliberately as a no-op) rather than as an error to retry.
 */
async function applyPaymentStatusTransition(
  reference: string,
  newStatus: "paid" | "failed",
  provider: string,
): Promise<PaymentUpdateOutcome> {
  const [existing] = await db.select().from(paymentsTable).where(eq(paymentsTable.providerReference, reference));
  if (!existing) return { outcome: "not_found" };

  if (existing.status === "cancelled") {
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    await db
      .update(paymentsTable)
      .set({
        metadata: {
          ...meta,
          reconciliationConflict: {
            attemptedStatus: newStatus,
            provider,
            detectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.providerReference, reference));

    console.warn(
      `[webhook] payment reconciliation conflict — payment=${existing.id} vendor=${existing.vendorId} ` +
      `reference=${reference} provider=${provider} attemptedStatus=${newStatus} — kept status=cancelled`,
    );

    await sendSlackAlert(
      `⚠️ *Payment reconciliation conflict*\n` +
      `• Payment #${existing.id} (vendor ${existing.vendorId}) was already *cancelled* locally, but ${provider} just reported it as *${newStatus}*.\n` +
      `• Reference: \`${reference}\`\n` +
      `• Status was NOT changed — review manually. This can happen if a customer completed payment on a stale link after the vendor cancelled or retried it.`,
    );

    return { outcome: "conflict" };
  }

  const [updated] = await db
    .update(paymentsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(paymentsTable.providerReference, reference))
    .returning({
      vendorId: paymentsTable.vendorId,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      orderId: paymentsTable.orderId,
    });

  if (!updated) return { outcome: "not_found" };

  if (newStatus === "paid") {
    const [paymentRow] = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.providerReference, reference));
    if (paymentRow) {
      await syncSaleFromPayment({
        id: paymentRow.id,
        vendorId: updated.vendorId,
        amount: updated.amount,
        currency: updated.currency,
      });
    }
  }

  return { outcome: "updated", payment: updated };
}

/**
 * Applies the business-logic side effects for a Stripe event. Idempotent-ish: safe to re-run.
 *
 * Returns `matched: false` when the event's target row (payment/order/vendor) could not be
 * found — e.g. it was deleted, or a retry runs after the underlying record no longer exists.
 * Callers use this to warn admins instead of reporting a bare success on a no-op retry.
 */
async function processStripeEvent(event: Stripe.Event): Promise<{ matched: boolean }> {
  const session =
    event.type === "checkout.session.completed"
      ? (event.data.object as Stripe.Checkout.Session)
      : null;

  if (event.type === "checkout.session.completed" && session) {
    const upgradeVendorId = session.metadata?.upgradeVendorId
      ? parseInt(session.metadata.upgradeVendorId)
      : null;
    const upgradeTier = session.metadata?.upgradeTier ?? null;

    if (upgradeVendorId && upgradeTier) {
      // ── Subscription self-upgrade path ──────────────────────────────
      const VALID_UPGRADE_TIERS = ["starter", "pro", "enterprise"];
      if (VALID_UPGRADE_TIERS.includes(upgradeTier)) {
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        const [vendorBeforeUpgrade] = await db
          .select({ subscriptionTier: vendorsTable.subscriptionTier })
          .from(vendorsTable)
          .where(eq(vendorsTable.id, upgradeVendorId));

        const [updated] = await db
          .update(vendorsTable)
          .set({
            subscriptionTier: upgradeTier,
            ...(subscriptionId && { stripeSubscriptionId: subscriptionId }),
            updatedAt: new Date(),
          })
          .where(eq(vendorsTable.id, upgradeVendorId))
          .returning({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier });

        if (updated) {
          console.info(
            `[stripe webhook] subscription upgrade — vendor=${upgradeVendorId} tier=${upgradeTier} session=${session.id}`,
          );

          // Record the checkout-driven upgrade in plan-change history too — the
          // customer.subscription.updated event that follows this checkout can
          // arrive with the tier already matching (previousTier === newTier by
          // the time it's processed), which would silently skip the notification
          // that event handler writes. Recording it here guarantees every
          // checkout-driven upgrade shows up, regardless of webhook event ordering.
          const previousTier = vendorBeforeUpgrade?.subscriptionTier ?? "free";
          if (previousTier !== upgradeTier) {
            await insertTierChangeNotification(
              upgradeVendorId,
              `Your plan was upgraded from ${previousTier} to ${upgradeTier}.`,
              previousTier,
              upgradeTier,
            );
          }
        } else {
          console.warn(
            `[stripe webhook] subscription upgrade — vendor ${upgradeVendorId} not found for session=${session.id}`,
          );
          return { matched: false };
        }
      } else {
        console.warn(
          `[stripe webhook] subscription upgrade — invalid tier '${upgradeTier}' in session=${session.id}`,
        );
        return { matched: false };
      }
    } else if (session?.metadata?.addonCreditId) {
      // ── Add-on credit purchase path ─────────────────────────────────
      const addonCreditId = parseInt(session.metadata.addonCreditId);
      const [addon] = await db
        .select()
        .from(vendorAddonCreditsTable)
        .where(eq(vendorAddonCreditsTable.id, addonCreditId))
        .limit(1);

      if (!addon) {
        console.warn(`[stripe webhook] addon checkout — no matching vendor_addon_credits row for id=${addonCreditId} session=${session.id}`);
        return { matched: false };
      }

      if (addon.status !== "pending") {
        // Already activated (duplicate webhook delivery) — safe no-op
        console.info(`[stripe webhook] addon checkout — already activated addonCreditId=${addonCreditId} status=${addon.status}`);
        return { matched: true };
      }

      await db
        .update(vendorAddonCreditsTable)
        .set({
          status: "active",
          unitsRemaining: addon.unitsGranted,
          gatewayPaymentId: session.id,
          updatedAt: new Date(),
        })
        .where(eq(vendorAddonCreditsTable.id, addonCreditId));

      console.info(
        `[stripe webhook] addon credits activated — addonCreditId=${addonCreditId} vendor=${addon.vendorId} resource=${addon.resource} units=${addon.unitsGranted} session=${session.id}`,
      );

      // Send in-app notification to vendor
      try {
        await db.insert(vendorNotificationsTable).values({
          vendorId: addon.vendorId,
          type: "addon_credits_activated",
          message: `Your add-on purchase of ${addon.unitsGranted} extra ${addon.resource} credits is now active and ready to use.`,
        });
      } catch (notifyErr) {
        console.warn("[stripe webhook] Failed to insert addon notification:", notifyErr);
      }
    } else {
      // ── Regular order checkout path ─────────────────────────────────
      const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;

      const result = await applyPaymentStatusTransition(session.id, "paid", "stripe");
      if (result.outcome === "conflict") {
        return { matched: true };
      }

      const updatedPayment = result.outcome === "updated" ? result.payment : null;

      let orderMatched = true;
      if (orderId && updatedPayment) {
        const [updatedOrder] = await db.update(ordersTable)
          .set({ paymentStatus: "paid", updatedAt: new Date() })
          .where(eq(ordersTable.id, orderId))
          .returning({ id: ordersTable.id });
        orderMatched = !!updatedOrder;
      }

      if (updatedPayment) {
        await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
      }

      console.info(`[stripe webhook] checkout.session.completed — session=${session.id} order=${orderId}`);

      if (!updatedPayment) {
        console.warn(`[stripe webhook] checkout.session.completed — no matching payment found for session=${session.id}`);
        return { matched: false };
      }
      if (orderId && !orderMatched) {
        console.warn(`[stripe webhook] checkout.session.completed — no matching order found for order=${orderId} session=${session.id}`);
        return { matched: false };
      }
    }

    console.info(`[stripe webhook] checkout.session.completed processed — session=${session.id}`);
    return { matched: true };
  }

  // ── Subscription plan switch (via Customer Portal) ────────────────────
  // Fires when a vendor changes price on their subscription inside the
  // Stripe Customer Portal. Each catalog Price carries metadata.tier (see
  // lib/stripe-catalog.ts) so the new tier can be read directly off the
  // subscription item without a second API call.
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const item = subscription.items.data[0];
    const newTier = item?.price?.metadata?.tier;

    // Compute trialEndsAt from the subscription state, regardless of tier change:
    // - status "trialing" with trial_end set → vendor is in trial → store the date
    // - anything else → trial is over (converted to active or cancelled) → clear it
    const trialEndsAt =
      subscription.status === "trialing" && subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null;

    if (newTier) {
      const [vendorBefore] = await db
        .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, subscriptionTier: vendorsTable.subscriptionTier })
        .from(vendorsTable)
        .where(eq(vendorsTable.stripeCustomerId, customerId));

      if (!vendorBefore) {
        console.warn(`[stripe webhook] subscription.updated — no vendor found for customer=${customerId}`);
        return { matched: false };
      }

      const [updated] = await db
        .update(vendorsTable)
        .set({
          subscriptionTier: newTier,
          stripeSubscriptionId: subscription.id,
          subscriptionProvider: "stripe",
          trialEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(vendorsTable.stripeCustomerId, customerId))
        .returning({ id: vendorsTable.id });

      if (updated) {
        console.info(
          `[stripe webhook] subscription plan switched via portal — vendor=${updated.id} customer=${customerId} tier=${newTier}`,
        );

        const previousTier = vendorBefore.subscriptionTier;
        if (previousTier !== newTier) {
          const isUpgrade = (TIER_RANK[newTier] ?? 0) > (TIER_RANK[previousTier] ?? 0);
          await db.insert(vendorNotificationsTable).values({
            vendorId: updated.id,
            type: "tier_change",
            message: isUpgrade
              ? `Your plan was upgraded from ${previousTier} to ${newTier} via the billing portal.`
              : `Your plan was downgraded from ${previousTier} to ${newTier} via the billing portal.`,
            previousTier,
            newTier,
          });

          if (vendorBefore.email) {
            await sendSubscriptionChangedEmail(vendorBefore.email, vendorBefore.name, previousTier, newTier);
          }
        }
      } else {
        console.warn(`[stripe webhook] subscription.updated — no vendor found for customer=${customerId}`);
        return { matched: false };
      }
    } else {
      console.info(
        `[stripe webhook] subscription.updated with no recognizable tier metadata — customer=${customerId}, skipping`,
      );
    }
    return { matched: true };
  }

  // ── Subscription cancellation ─────────────────────────────────────────
  // Fired at the end of the billing period once Stripe finishes cancelling
  // a subscription (whether cancelled immediately or "at period end" via
  // the Customer Portal). Drop the vendor back to the free tier.
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const [vendorBefore] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, subscriptionTier: vendorsTable.subscriptionTier })
      .from(vendorsTable)
      .where(eq(vendorsTable.stripeCustomerId, customerId));

    if (!vendorBefore) {
      console.warn(`[stripe webhook] subscription cancelled — no vendor found for customer=${customerId}`);
      return { matched: false };
    }

    const [updated] = await db
      .update(vendorsTable)
      .set({ subscriptionTier: "free", stripeSubscriptionId: null, updatedAt: new Date() })
      .where(eq(vendorsTable.stripeCustomerId, customerId))
      .returning({ id: vendorsTable.id });

    if (updated) {
      console.info(
        `[stripe webhook] subscription cancelled — vendor=${updated.id} customer=${customerId} downgraded to free`,
      );

      const previousTier = vendorBefore.subscriptionTier;
      await insertTierChangeNotification(
        updated.id,
        `Your ${previousTier} subscription was cancelled, so your account has been moved back to the Free tier.`,
        previousTier,
        "free",
      );

      if (vendorBefore.email) {
        await sendSubscriptionCancelledEmail(vendorBefore.email, vendorBefore.name, previousTier);
      }
    } else {
      console.warn(`[stripe webhook] subscription cancelled — no vendor found for customer=${customerId}`);
      return { matched: false };
    }
    return { matched: true };
  }

  // ── Trial ending soon ─────────────────────────────────────────────────────────
  // Stripe fires this 3 days before the trial ends (the window is configurable in
  // the Stripe dashboard). We send the vendor an in-app notification and email so
  // they know their card is about to be charged.
  if (event.type === "customer.subscription.trial_will_end") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const item = subscription.items.data[0];
    const amountCents = item?.price?.unit_amount ?? 0;
    const currency = (item?.price?.currency ?? "usd").toUpperCase();
    const rawTier = item?.price?.metadata?.tier ?? "";
    const tierName = rawTier ? rawTier.charAt(0).toUpperCase() + rawTier.slice(1) : "paid";
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    const [vendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email })
      .from(vendorsTable)
      .where(eq(vendorsTable.stripeCustomerId, customerId));

    if (!vendor) {
      console.warn(`[stripe webhook] trial_will_end — no vendor found for customer=${customerId}`);
      return { matched: false };
    }

    const dateStr = trialEnd
      ? trialEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "soon";
    const amountStr = amountCents ? `${(amountCents / 100).toFixed(2)} ${currency}` : "the subscription amount";

    await db.insert(vendorNotificationsTable).values({
      vendorId: vendor.id,
      type: "subscription",
      message: `Your ${tierName} free trial ends on ${dateStr}. Your card will be charged ${amountStr} to continue your subscription.`,
    });

    if (vendor.email) {
      const bodyHtml = `
        <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">Your free trial is ending soon</h1>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          Hi ${escapeHtml(vendor.name)}, your VendorHub ${escapeHtml(tierName)} free trial ends on <strong>${escapeHtml(dateStr)}</strong>.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          Your card on file will be automatically charged <strong>${escapeHtml(amountStr)}</strong> to continue your subscription.
          No action is needed if you'd like to keep your plan.
        </p>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          To cancel before being charged, open the billing portal from your dashboard.
        </p>`;
      const html = wrapVendorEmail({ bodyHtml });
      const emailResult = await sendEmail({
        to: vendor.email,
        subject: `Your ${tierName} trial ends on ${dateStr}`,
        html,
      });
      if (emailResult.status !== "sent") {
        console.warn(`[stripe webhook] trial_will_end email did not send — vendor=${vendor.id} reason=${emailResult.error}`);
      }
    }

    console.info(`[stripe webhook] trial_will_end — vendor=${vendor.id} customer=${customerId} ends=${dateStr}`);
    return { matched: true };
  }

  // ── Refunded charge ────────────────────────────────────────────────────
  // Fired when a charge is refunded (fully or partially), including disputed
  // charges that get reversed. If the charge belongs to a vendor's paid
  // subscription (matched via Stripe Customer id), immediately revert the
  // vendor to the free tier so they don't keep paid features they no longer
  // paid for. Order-level charges (no matching vendor by customer id) are
  // left alone here — that path is unrelated to subscription tier.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const customerId =
      typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;

    if (!customerId) {
      console.info(`[stripe webhook] charge.refunded with no customer — skipping — charge=${charge.id}`);
      return { matched: false };
    }

    const [vendor] = await db
      .select({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier })
      .from(vendorsTable)
      .where(eq(vendorsTable.stripeCustomerId, customerId));

    if (!vendor) {
      console.info(`[stripe webhook] charge.refunded — no vendor found for customer=${customerId}`);
      return { matched: false };
    }

    if (vendor.subscriptionTier === "free") {
      console.info(`[stripe webhook] charge.refunded — vendor=${vendor.id} already on free tier, nothing to do`);
      return { matched: true };
    }

    const previousTier = vendor.subscriptionTier;

    await db
      .update(vendorsTable)
      .set({ subscriptionTier: "free", updatedAt: new Date() })
      .where(eq(vendorsTable.id, vendor.id));

    await insertTierChangeNotification(
      vendor.id,
      `Your ${previousTier} plan payment was refunded, so your account has been moved back to the Free tier.`,
      previousTier,
      "free",
    );

    console.warn(
      `[stripe webhook] charge.refunded — vendor=${vendor.id} downgraded from ${previousTier} to free — charge=${charge.id} customer=${customerId}`,
    );
    return { matched: true };
  }

  // ── Expired checkout session ───────────────────────────────────────────
  // A subscription upgrade checkout expired without completing payment.
  // No tier was ever granted (that only happens on checkout.session.completed),
  // so there is nothing to revert — just log for observability.
  if (event.type === "checkout.session.expired") {
    const expiredSession = event.data.object as Stripe.Checkout.Session;
    const upgradeVendorId = expiredSession.metadata?.upgradeVendorId
      ? parseInt(expiredSession.metadata.upgradeVendorId)
      : null;

    if (upgradeVendorId) {
      console.info(
        `[stripe webhook] checkout.session.expired — subscription upgrade abandoned — vendor=${upgradeVendorId} session=${expiredSession.id}`,
      );
    } else {
      const orderId = expiredSession.metadata?.orderId ? parseInt(expiredSession.metadata.orderId) : null;
      const expiredResult = await applyPaymentStatusTransition(expiredSession.id, "failed", "stripe");
      if (expiredResult.outcome === "conflict") {
        return { matched: true };
      }
      const updatedPayment = expiredResult.outcome === "updated" ? expiredResult.payment : null;

      if (updatedPayment) {
        await notifyVendorPaymentStatus(updatedPayment.vendorId, "failed", updatedPayment.amount, updatedPayment.currency);
      }

      console.info(`[stripe webhook] checkout.session.expired — order checkout abandoned — order=${orderId} session=${expiredSession.id}`);

      if (!updatedPayment) {
        console.warn(`[stripe webhook] checkout.session.expired — no matching payment found for session=${expiredSession.id}`);
        return { matched: false };
      }
    }
    return { matched: true };
  }

  console.info(`[stripe webhook] unhandled event type skipped — type=${event.type} id=${event.id}`);
  return { matched: true };
}

/**
 * Applies the business-logic side effects for a Paystack event. Idempotent-ish: safe to re-run.
 *
 * Returns `matched: false` when the target payment could not be found (see processStripeEvent).
 */
interface PaystackWebhookEvent {
  event: string;
  data: {
    id?: number | string;
    reference?: string;
    metadata?: { orderId?: string; upgradeVendorId?: string; upgradeTier?: string; addonCreditId?: string; addonVendorId?: string; addonResource?: string; addonQuantity?: string };
    plan?: { plan_code?: string } | null;
    plan_object?: { plan_code?: string } | null;
    subscription_code?: string;
    email_token?: string;
    customer?: { customer_code?: string };
  };
}

const VALID_UPGRADE_TIERS = ["starter", "pro", "enterprise"];

async function processPaystackEvent(event: PaystackWebhookEvent): Promise<{ matched: boolean }> {
  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    if (!reference) return { matched: false };

    // ── Subscription self-upgrade path ──────────────────────────────────
    // Paystack fires charge.success for the initial subscription charge too
    // (with our metadata attached, since we set it on transaction/initialize).
    // A regular order charge never carries these fields.
    const upgradeVendorId = metadata?.upgradeVendorId ? parseInt(metadata.upgradeVendorId) : null;
    const upgradeTier = metadata?.upgradeTier ?? null;

    if (upgradeVendorId && upgradeTier && VALID_UPGRADE_TIERS.includes(upgradeTier)) {
      const { applyVendorPaystackTierUpgrade } = await import("../../lib/subscription-sync");
      const customerCode = event.data.customer?.customer_code ?? null;
      const result = await applyVendorPaystackTierUpgrade(
        upgradeVendorId,
        upgradeTier,
        { paystackCustomerCode: customerCode },
        "webhook",
      );
      if (!result.applied) {
        console.warn(`[paystack webhook] subscription upgrade skipped — vendor=${upgradeVendorId} reason=${result.reason} reference=${reference}`);
      } else {
        console.info(`[paystack webhook] subscription upgrade — vendor=${upgradeVendorId} tier=${upgradeTier} reference=${reference}`);
      }
      return { matched: true };
    }

    // ── Add-on credit purchase path ──────────────────────────────────────
    const addonCreditId = metadata?.addonCreditId ? parseInt(metadata.addonCreditId) : null;
    if (addonCreditId) {
      const [addon] = await db
        .select()
        .from(vendorAddonCreditsTable)
        .where(eq(vendorAddonCreditsTable.id, addonCreditId))
        .limit(1);

      if (!addon) {
        console.warn(`[paystack webhook] addon charge — no matching vendor_addon_credits row for id=${addonCreditId} reference=${reference}`);
        return { matched: false };
      }

      if (addon.status !== "pending") {
        // Already activated (duplicate webhook delivery) — safe no-op
        console.info(`[paystack webhook] addon charge — already activated addonCreditId=${addonCreditId} status=${addon.status}`);
        return { matched: true };
      }

      await db
        .update(vendorAddonCreditsTable)
        .set({
          status: "active",
          unitsRemaining: addon.unitsGranted,
          gatewayPaymentId: reference,
          updatedAt: new Date(),
        })
        .where(eq(vendorAddonCreditsTable.id, addonCreditId));

      console.info(
        `[paystack webhook] addon credits activated — addonCreditId=${addonCreditId} vendor=${addon.vendorId} resource=${addon.resource} units=${addon.unitsGranted} reference=${reference}`,
      );

      // Send in-app notification to vendor
      try {
        await db.insert(vendorNotificationsTable).values({
          vendorId: addon.vendorId,
          type: "addon_credits_activated",
          message: `Your add-on purchase of ${addon.unitsGranted} extra ${addon.resource} credits is now active and ready to use.`,
        });
      } catch (notifyErr) {
        console.warn("[paystack webhook] Failed to insert addon notification:", notifyErr);
      }

      return { matched: true };
    }

    // ── Regular order checkout path ──────────────────────────────────────
    const orderId = metadata?.orderId ? parseInt(metadata.orderId) : null;

    const result = await applyPaymentStatusTransition(reference, "paid", "paystack");
    if (result.outcome === "conflict") {
      return { matched: true };
    }
    const updatedPayment = result.outcome === "updated" ? result.payment : null;

    let orderMatched = true;
    if (orderId && updatedPayment) {
      const [updatedOrder] = await db.update(ordersTable)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId))
        .returning({ id: ordersTable.id });
      orderMatched = !!updatedOrder;
    }

    if (updatedPayment) {
      await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
    }

    console.info(`[paystack webhook] charge.success — reference=${reference} order=${orderId}`);

    if (!updatedPayment) {
      console.warn(`[paystack webhook] charge.success — no matching payment found for reference=${reference}`);
      return { matched: false };
    }
    if (orderId && !orderMatched) {
      console.warn(`[paystack webhook] charge.success — no matching order found for order=${orderId} reference=${reference}`);
      return { matched: false };
    }
    return { matched: true };
  } else if (event.event === "subscription.create") {
    // Fires shortly after the initial charge.success above, carrying the
    // subscription_code + email_token we need to later cancel via
    // /subscription/disable. Match the vendor by the customer_code we just
    // stored from charge.success (charge.success is delivered first).
    const customerCode = event.data.customer?.customer_code;
    const subscriptionCode = event.data.subscription_code;
    const emailToken = event.data.email_token;
    if (!customerCode || !subscriptionCode || !emailToken) {
      console.warn(`[paystack webhook] subscription.create missing fields — skipping`);
      return { matched: false };
    }

    const [vendor] = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.paystackCustomerCode, customerCode));

    if (!vendor) {
      console.warn(`[paystack webhook] subscription.create — no vendor found for customer_code=${customerCode}`);
      return { matched: false };
    }

    await db
      .update(vendorsTable)
      .set({ paystackSubscriptionCode: subscriptionCode, paystackEmailToken: emailToken, updatedAt: new Date() })
      .where(eq(vendorsTable.id, vendor.id));

    console.info(`[paystack webhook] subscription.create — vendor=${vendor.id} subscription=${subscriptionCode}`);
    return { matched: true };
  } else if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    // Paystack disabled the subscription (repeated failed renewal charges,
    // or our own /subscription/paystack/cancel route calling disable) —
    // drop the vendor back to free, mirroring Stripe's customer.subscription.deleted.
    const subscriptionCode = event.data.subscription_code;
    if (!subscriptionCode) return { matched: false };

    const [vendor] = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.paystackSubscriptionCode, subscriptionCode));

    if (!vendor) {
      console.info(`[paystack webhook] ${event.event} — no vendor found for subscription=${subscriptionCode} (likely already cancelled via API)`);
      return { matched: true };
    }

    if (vendor.subscriptionTier === "free") {
      return { matched: true }; // already downgraded (e.g. by the cancel route)
    }

    const { applyVendorTierDowngrade } = await import("../../lib/subscription-sync");
    await applyVendorTierDowngrade(vendor, "webhook");
    console.info(`[paystack webhook] ${event.event} — vendor=${vendor.id} downgraded to free`);
    return { matched: true };
  } else if (event.event === "invoice.payment_failed") {
    // Paystack retries automatically; no immediate downgrade — subscription.disable
    // fires once retries are exhausted. Just log for observability.
    console.info(`[paystack webhook] invoice.payment_failed — subscription=${event.data.subscription_code ?? "unknown"}`);
    return { matched: true };
  } else {
    console.info(`[paystack webhook] unhandled event type skipped — type=${event.event} id=${event.data.id ?? event.data.reference}`);
    return { matched: true };
  }
}

/**
 * Applies the business-logic side effects for a Flutterwave event. Idempotent-ish: safe to re-run.
 * Returns `matched: false` when the target payment could not be found (see processStripeEvent).
 */
async function processFlutterwaveEvent(event: {
  event: string;
  data: { tx_ref: string; status: string; meta?: { orderId?: string } };
}): Promise<{ matched: boolean }> {
  const { tx_ref: reference, status, meta } = event.data;
  const orderId = meta?.orderId ? parseInt(meta.orderId) : null;

  if (status !== "successful") {
    const failedResult = await applyPaymentStatusTransition(reference, "failed", "flutterwave");
    if (failedResult.outcome !== "conflict") {
      console.info(`[flutterwave webhook] non-successful status=${status} reference=${reference}`);
    }
    return { matched: true };
  }

  const result = await applyPaymentStatusTransition(reference, "paid", "flutterwave");
  if (result.outcome === "conflict") {
    return { matched: true };
  }
  const updatedPayment = result.outcome === "updated" ? result.payment : null;

  let orderMatched = true;
  if (orderId && updatedPayment) {
    const [updatedOrder] = await db.update(ordersTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id });
    orderMatched = !!updatedOrder;
  }

  if (updatedPayment) {
    await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
  }

  console.info(`[flutterwave webhook] successful — reference=${reference} order=${orderId}`);

  if (!updatedPayment) {
    console.warn(`[flutterwave webhook] successful — no matching payment found for reference=${reference}`);
    return { matched: false };
  }
  if (orderId && !orderMatched) {
    console.warn(`[flutterwave webhook] successful — no matching order found for order=${orderId} reference=${reference}`);
    return { matched: false };
  }
  return { matched: true };
}

/**
 * Applies the business-logic side effects for a Nomba event. Idempotent-ish: safe to re-run.
 * Returns `matched: false` when the target payment could not be found (see processStripeEvent).
 */
async function processNombaEvent(event: {
  event_type: string;
  data: { order?: { orderReference?: string }; transaction?: { status?: string }; orderReference?: string };
}): Promise<{ matched: boolean }> {
  const reference = event.data?.order?.orderReference ?? event.data?.orderReference;
  const status = event.data?.transaction?.status?.toLowerCase();
  const success = status === "success" || event.event_type === "payment_success";

  if (!reference) {
    console.warn(`[nomba webhook] event with no order reference — type=${event.event_type}`);
    return { matched: false };
  }

  if (!success) {
    await applyPaymentStatusTransition(reference, "failed", "nomba");
    console.info(`[nomba webhook] non-success status=${status} reference=${reference}`);
    return { matched: true };
  }

  const result = await applyPaymentStatusTransition(reference, "paid", "nomba");
  if (result.outcome === "conflict") {
    return { matched: true };
  }
  const updatedPayment = result.outcome === "updated" ? result.payment : null;

  if (updatedPayment?.orderId) {
    await db.update(ordersTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(ordersTable.id, updatedPayment.orderId));
  }

  if (updatedPayment) {
    await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
  }

  console.info(`[nomba webhook] payment success — reference=${reference}`);

  if (!updatedPayment) {
    console.warn(`[nomba webhook] payment success — no matching payment found for reference=${reference}`);
    return { matched: false };
  }
  return { matched: true };
}

/**
 * Applies the business-logic side effects for a Remita callback. Idempotent-ish: safe to re-run.
 *
 * Remita does not sign its inbound callbacks, so the callback is treated only as a
 * "check now" trigger: we re-query Remita's own status API for the RRR using the same
 * merchantId/apiKey hash scheme used at checkout, and only mark the payment paid if
 * Remita's own records confirm the transaction succeeded.
 */
async function processRemitaEvent(event: { rrr: string }): Promise<{ matched: boolean }> {
  const { rrr } = event;

  const merchantId = await resolveGatewayField("remita", "merchantId");
  const apiKey = await resolveGatewayField("remita", "apiKey");
  if (!merchantId || !apiKey) {
    throw new Error("Remita is not configured — cannot verify RRR status");
  }

  const hash = crypto.createHash("sha512").update(`${rrr}${apiKey}${merchantId}`).digest("hex");

  const response = await fetch(
    `https://login.remita.net/remita/exapp/api/v1/send/api/echannelsvc/${merchantId}/${rrr}/${hash}/status.reg`,
  );
  const statusData = (await response.json().catch(() => ({}))) as { status?: string; message?: string };

  // Remita's confirmed-success status is "00"
  if (statusData.status !== "00") {
    console.info(`[remita webhook] RRR ${rrr} not yet confirmed paid — status=${statusData.status}`);
    return { matched: true };
  }

  const result = await applyPaymentStatusTransition(rrr, "paid", "remita");
  if (result.outcome === "conflict") {
    return { matched: true };
  }
  const updatedPayment = result.outcome === "updated" ? result.payment : null;

  if (updatedPayment?.orderId) {
    await db.update(ordersTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(ordersTable.id, updatedPayment.orderId));
  }

  if (updatedPayment) {
    await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
  }

  console.info(`[remita webhook] confirmed paid — rrr=${rrr}`);

  if (!updatedPayment) {
    console.warn(`[remita webhook] confirmed paid — no matching payment found for rrr=${rrr}`);
    return { matched: false };
  }
  return { matched: true };
}

/**
 * Re-processes a stored webhook event's raw payload through the same business
 * logic used by the live webhook handlers. Used by the admin "Retry" action
 * for skipped/failed events. Does NOT re-verify provider signatures — the
 * payload was already verified and persisted at original delivery time.
 *
 * Throws if the event id is unknown or the event was already processed.
 * On success, sets processedAt. On failure, records the error and rethrows.
 *
 * If the event replayed cleanly but its target payment/order/vendor row no longer
 * exists (deleted or already changed since original delivery), `warning` is set so
 * the admin isn't given false confidence that the retry actually fixed anything.
 */
export async function retryWebhookEventById(id: number): Promise<{ eventId: string; warning?: string }> {
  const [row] = await db.select().from(webhookEventsTable).where(eq(webhookEventsTable.id, id));
  if (!row) {
    throw Object.assign(new Error("Webhook event not found"), { statusCode: 404 });
  }
  if (row.processedAt) {
    throw Object.assign(new Error("Webhook event was already processed"), { statusCode: 409 });
  }

  // Record this retry attempt (count + timestamp) regardless of outcome, so
  // admins can see repeated-failure patterns even when the retry itself fails.
  await db
    .update(webhookEventsTable)
    .set({ retryCount: sql`${webhookEventsTable.retryCount} + 1`, lastRetriedAt: new Date() })
    .where(eq(webhookEventsTable.id, id));

  let matched = true;
  try {
    if (row.provider === "stripe") {
      ({ matched } = await processStripeEvent(row.rawPayload as unknown as Stripe.Event));
    } else if (row.provider === "paystack") {
      ({ matched } = await processPaystackEvent(row.rawPayload as unknown as PaystackWebhookEvent));
    } else if (row.provider === "flutterwave") {
      ({ matched } = await processFlutterwaveEvent(row.rawPayload as unknown as {
        event: string;
        data: { tx_ref: string; status: string; meta?: { orderId?: string } };
      }));
    } else if (row.provider === "nomba") {
      ({ matched } = await processNombaEvent(row.rawPayload as unknown as {
        event_type: string;
        data: { order?: { orderReference?: string }; transaction?: { status?: string }; orderReference?: string };
      }));
    } else if (row.provider === "remita") {
      ({ matched } = await processRemitaEvent(row.rawPayload as unknown as { rrr: string }));
    } else if (row.provider === "paypal") {
      ({ matched } = await processPayPalEvent(row.rawPayload as unknown as PayPalWebhookEvent));
    } else {
      throw new Error(`Unknown provider '${row.provider}'`);
    }
    await markWebhookProcessed(row.eventId);
    console.info(`[webhook] admin retry succeeded — id=${row.id} eventId=${row.eventId} matched=${matched}`);
  } catch (err) {
    await markWebhookFailed(row.eventId, row.provider, row.eventType, err).catch(() => {});
    console.error(`[webhook] admin retry failed — id=${row.id} eventId=${row.eventId}:`, err);
    throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), { statusCode: 502 });
  }

  if (!matched) {
    return {
      eventId: row.eventId,
      warning:
        "Retry ran successfully, but no matching payment, order, or vendor was found to update — " +
        "it may have been deleted or already changed since this event was first received.",
    };
  }

  return { eventId: row.eventId };
}

// ── Stripe webhook ────────────────────────────────────────────────────────────

router.post("/payments/stripe/webhook", async (req, res): Promise<void> => {
  const webhookSecret = await resolveGatewayField("stripe", "webhookSecret");
  if (!webhookSecret) { res.status(503).json({ error: "Stripe is not configured. Add a platform Stripe key in Admin \u2192 Payment Gateways." }); return; }
  const stripeKey = await resolveGatewayField("stripe", "secretKey");
  if (!stripeKey) { res.status(503).json({ error: "Stripe is not configured. Add a platform Stripe key in Admin \u2192 Payment Gateways." }); return; }

  const sig = req.headers["stripe-signature"];
  if (!sig) { res.status(400).json({ error: "Missing stripe-signature header" }); return; }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event = stripe.webhooks.constructEvent(req.body as any, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
    return;
  }

  const session =
    event.type === "checkout.session.completed"
      ? (event.data.object as Stripe.Checkout.Session)
      : null;

  /**
   * Full pipeline: log → business logic → mark processed.
   *
   * Business-logic failures call markWebhookFailed before rethrowing so that
   * errorMessage is always set on failure — enabling the atomic claim path to
   * reclaim the row on the next retry (provider or buffer drainer).
   *
   * Stored as a closure so the buffer can replay it when the DB recovers.
   */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "stripe",
      eventType:  event.type,
      eventId:    event.id,
      reference:  session?.id ?? null,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processStripeEvent(event);
      await markWebhookProcessed(event.id);
    } catch (bizErr) {
      await markWebhookFailed(event.id, "stripe", event.type, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId: event.id, provider: "stripe", eventType: event.type, process: fullPipeline });
      console.warn(`[stripe webhook] DB unavailable — event ${event.id} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[stripe webhook] Processing failed — event=${event.id}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Paystack webhook ──────────────────────────────────────────────────────────

router.post("/payments/paystack/webhook", async (req, res): Promise<void> => {
  const webhookSecret = await resolveGatewayField("paystack", "webhookSecret");
  if (!webhookSecret) { res.status(503).json({ error: "Paystack is not configured. Add a platform Paystack key in Admin \u2192 Payment Gateways." }); return; }

  const rawBody = req.body as Buffer;
  const hash = crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
  const incomingHash = req.headers["x-paystack-signature"] as string;

  if (!incomingHash || hash !== incomingHash) {
    res.status(400).json({ error: "Invalid Paystack webhook signature" });
    return;
  }

  const event = JSON.parse(rawBody.toString()) as PaystackWebhookEvent;

  const eventReference = event.data.reference ?? event.data.subscription_code ?? null;
  const eventId = event.data.id
    ? `paystack-${event.data.id}`
    : `paystack-${event.event}-${eventReference}`;

  /** Same pipeline/safety model as the Stripe handler above. */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "paystack",
      eventType:  event.event,
      eventId,
      reference:  eventReference,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processPaystackEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "paystack", event.event, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "paystack", eventType: event.event, process: fullPipeline });
      console.warn(`[paystack webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[paystack webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Flutterwave webhook ────────────────────────────────────────────────────────

router.post("/payments/flutterwave/webhook", async (req, res): Promise<void> => {
  const webhookSecretHash = await resolveGatewayField("flutterwave", "webhookSecretHash");
  if (!webhookSecretHash) { res.status(503).json({ error: "Flutterwave is not configured. Add a platform Flutterwave key in Admin \u2192 Payment Gateways." }); return; }

  const incomingHash = req.headers["verif-hash"] as string | undefined;
  if (!incomingHash || incomingHash !== webhookSecretHash) {
    res.status(400).json({ error: "Invalid Flutterwave webhook signature" });
    return;
  }

  const rawBody = req.body as Buffer;
  const event = JSON.parse(rawBody.toString()) as {
    event: string;
    data: { id?: number | string; tx_ref: string; status: string; meta?: { orderId?: string } };
  };

  const eventId = event.data.id ? `flutterwave-${event.data.id}` : `flutterwave-${event.data.tx_ref}-${event.data.status}`;

  /** Same pipeline/safety model as the Stripe handler above. */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "flutterwave",
      eventType:  event.event ?? event.data.status,
      eventId,
      reference:  event.data.tx_ref,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processFlutterwaveEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "flutterwave", event.event ?? event.data.status, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "flutterwave", eventType: event.event ?? event.data.status, process: fullPipeline });
      console.warn(`[flutterwave webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[flutterwave webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Nomba webhook ──────────────────────────────────────────────────────────────

router.post("/payments/nomba/webhook", async (req, res): Promise<void> => {
  const clientSecret = await resolveGatewayField("nomba", "clientSecret");
  if (!clientSecret) { res.status(503).json({ error: "Nomba is not configured. Add a platform Nomba key in Admin \u2192 Payment Gateways." }); return; }

  const rawBody = req.body as Buffer;
  const incomingSignature = req.headers["signature"] as string | undefined;
  const expectedSignature = crypto.createHmac("sha256", clientSecret).update(rawBody).digest("hex");

  if (!incomingSignature || incomingSignature !== expectedSignature) {
    res.status(400).json({ error: "Invalid Nomba webhook signature" });
    return;
  }

  const event = JSON.parse(rawBody.toString()) as {
    event_type: string;
    data: { order?: { orderReference?: string }; transaction?: { status?: string; id?: string }; orderReference?: string };
  };

  const reference = event.data?.order?.orderReference ?? event.data?.orderReference ?? "unknown";
  const eventId = event.data?.transaction?.id
    ? `nomba-${event.data.transaction.id}`
    : `nomba-${reference}-${event.event_type}`;

  /** Same pipeline/safety model as the Stripe handler above. */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "nomba",
      eventType:  event.event_type,
      eventId,
      reference,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processNombaEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "nomba", event.event_type, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "nomba", eventType: event.event_type, process: fullPipeline });
      console.warn(`[nomba webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[nomba webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Remita callback ─────────────────────────────────────────────────────────────
// Remita doesn't sign inbound callbacks, so this is treated only as a trigger to
// re-verify status directly against Remita's own status API (see processRemitaEvent).
// Registered as JSON (not raw) — Remita's callback body has no signature to verify.

router.post("/payments/remita/webhook", async (req, res): Promise<void> => {
  const remitaMerchantId = await resolveGatewayField("remita", "merchantId");
  if (!remitaMerchantId) { res.status(503).json({ error: "Remita is not configured. Add a platform Remita key in Admin \u2192 Payment Gateways." }); return; }

  const { RRR, rrr } = req.body as { RRR?: string; rrr?: string };
  const reference = RRR ?? rrr;
  if (!reference) { res.status(400).json({ error: "Missing RRR in Remita callback" }); return; }

  const eventId = `remita-${reference}-${Date.now()}`;
  const event = { rrr: reference };

  /** Same pipeline/safety model as the Stripe handler above, minus dedup-by-eventId
   *  since Remita callbacks carry no unique id — dedup instead happens naturally
   *  because processRemitaEvent only flips status once (paymentsTable.status). */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "remita",
      eventType:  "callback",
      eventId,
      reference: reference ?? null,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processRemitaEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "remita", "callback", bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "remita", eventType: "callback", process: fullPipeline });
      console.warn(`[remita webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[remita webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── PayPal webhook ────────────────────────────────────────────────────────────
// PayPal subscription billing events (BILLING.SUBSCRIPTION.*).
// Uses PayPal's verify-webhook-signature API instead of HMAC — the verification
// call sends the event body back to PayPal for certificate-based validation.
// If no webhookId is configured in the platform credentials, we skip verification
// (permissive dev/sandbox mode) and log a warning.

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource: {
    id: string;          // subscription ID (I-XXXXX) or capture/order ID
    plan_id?: string;
    status?: string;
    custom_id?: string;  // JSON: { upgradeVendorId, upgradeTier } or { orderId, vendorId }
    supplementary_data?: {
      related_ids?: {
        order_id?: string;   // PayPal Order ID — present on capture events
      };
    };
    amount?: { value?: string; currency_code?: string };
  };
}

async function processPayPalEvent(event: PayPalWebhookEvent): Promise<{ matched: boolean }> {
  const { event_type: eventType, resource } = event;

  // Parse the custom_id that we attached at subscription creation time
  let metadata: { upgradeVendorId?: string; upgradeTier?: string } = {};
  try {
    if (resource.custom_id) {
      metadata = JSON.parse(resource.custom_id) as typeof metadata;
    }
  } catch {
    console.warn(`[paypal webhook] could not parse custom_id — event=${event.id}`);
  }

  const upgradeVendorId = metadata.upgradeVendorId ? parseInt(metadata.upgradeVendorId) : null;
  const upgradeTier = metadata.upgradeTier ?? null;
  const subscriptionId = resource.id;

  const VALID_TIERS = ["starter", "pro", "enterprise"];

  if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
    if (!upgradeVendorId || !upgradeTier || !VALID_TIERS.includes(upgradeTier)) {
      console.warn(`[paypal webhook] ACTIVATED — missing/invalid metadata — event=${event.id}`);
      return { matched: false };
    }

    const [vendorBefore] = await db
      .select({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, upgradeVendorId));

    if (!vendorBefore) {
      console.warn(`[paypal webhook] ACTIVATED — no vendor found — vendorId=${upgradeVendorId} event=${event.id}`);
      return { matched: false };
    }

    const [updated] = await db
      .update(vendorsTable)
      .set({
        subscriptionTier: upgradeTier,
        paypalSubscriptionId: subscriptionId,
        subscriptionProvider: "paypal",
        updatedAt: new Date(),
      })
      .where(eq(vendorsTable.id, upgradeVendorId))
      .returning({ id: vendorsTable.id });

    if (updated) {
      const previousTier = vendorBefore.subscriptionTier;
      if (previousTier !== upgradeTier) {
        await insertTierChangeNotification(
          updated.id,
          `Your plan was upgraded from ${previousTier} to ${upgradeTier} via PayPal.`,
          previousTier,
          upgradeTier,
        );
      }
      console.info(`[paypal webhook] ACTIVATED — vendor=${upgradeVendorId} tier=${upgradeTier} sub=${subscriptionId}`);
    }

    return { matched: !!updated };
  }

  if (
    eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
    eventType === "BILLING.SUBSCRIPTION.EXPIRED" ||
    eventType === "BILLING.SUBSCRIPTION.SUSPENDED"
  ) {
    const [vendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, subscriptionTier: vendorsTable.subscriptionTier })
      .from(vendorsTable)
      .where(eq(vendorsTable.paypalSubscriptionId, subscriptionId));

    if (!vendor) {
      console.info(`[paypal webhook] ${eventType} — no vendor found for sub=${subscriptionId} (may already be cancelled)`);
      return { matched: true }; // treat as success — nothing to do
    }

    if (vendor.subscriptionTier === "free") {
      return { matched: true }; // already downgraded
    }

    const previousTier = vendor.subscriptionTier;
    await db
      .update(vendorsTable)
      .set({ subscriptionTier: "free", paypalSubscriptionId: null, subscriptionProvider: null, updatedAt: new Date() })
      .where(eq(vendorsTable.id, vendor.id));

    await insertTierChangeNotification(
      vendor.id,
      `Your ${previousTier} PayPal subscription was ${eventType === "BILLING.SUBSCRIPTION.CANCELLED" ? "cancelled" : eventType === "BILLING.SUBSCRIPTION.EXPIRED" ? "expired" : "suspended"}, so your account has been moved back to the Free tier.`,
      previousTier,
      "free",
    );

    if (vendor.email) {
      await sendSubscriptionCancelledEmail(vendor.email, vendor.name, previousTier);
    }

    console.info(`[paypal webhook] ${eventType} — vendor=${vendor.id} downgraded from ${previousTier} to free`);
    return { matched: true };
  }

  // ── Order-level payment events (vendor customer checkout) ─────────────────
  // These fire when a customer pays via PayPal on a vendor's storefront.
  // The providerReference stored at checkout is the PayPal Order ID, which is
  // echoed back on capture events via resource.supplementary_data.related_ids.order_id.

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id ?? resource.id;
    if (!paypalOrderId) {
      console.warn(`[paypal webhook] PAYMENT.CAPTURE.COMPLETED — no order_id — event=${event.id}`);
      return { matched: false };
    }

    const result = await applyPaymentStatusTransition(paypalOrderId, "paid", "paypal");
    if (result.outcome === "conflict") {
      return { matched: true };
    }
    const updatedPayment = result.outcome === "updated" ? result.payment : null;

    if (updatedPayment?.orderId) {
      await db
        .update(ordersTable)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, updatedPayment.orderId));
    }

    if (updatedPayment) {
      await notifyVendorPaymentStatus(updatedPayment.vendorId, "paid", updatedPayment.amount, updatedPayment.currency);
    }

    console.info(`[paypal webhook] PAYMENT.CAPTURE.COMPLETED — orderId=${paypalOrderId} matched=${result.outcome !== "not_found"}`);
    if (!updatedPayment) {
      // No matching payment row — could be a manual/external PayPal capture
      console.warn(`[paypal webhook] PAYMENT.CAPTURE.COMPLETED — no matching payment for order=${paypalOrderId}`);
      return { matched: false };
    }
    return { matched: true };
  }

  if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "PAYMENT.CAPTURE.REVERSED") {
    const paypalOrderId = resource.supplementary_data?.related_ids?.order_id ?? resource.id;
    if (!paypalOrderId) {
      console.warn(`[paypal webhook] ${eventType} — no order_id — event=${event.id}`);
      return { matched: false };
    }

    const result = await applyPaymentStatusTransition(paypalOrderId, "failed", "paypal");
    if (result.outcome === "conflict") {
      return { matched: true };
    }
    const updatedPayment = result.outcome === "updated" ? result.payment : null;

    if (updatedPayment) {
      await notifyVendorPaymentStatus(updatedPayment.vendorId, "failed", updatedPayment.amount, updatedPayment.currency);
    }

    console.info(`[paypal webhook] ${eventType} — orderId=${paypalOrderId}`);
    return { matched: true };
  }

  console.info(`[paypal webhook] unhandled event type skipped — type=${eventType} id=${event.id}`);
  return { matched: true };
}

router.post("/payments/paypal/webhook", async (req, res): Promise<void> => {
  const paypalClientId = await resolveGatewayField("paypal", "clientId");
  const paypalClientSecret = await resolveGatewayField("paypal", "clientSecret");
  if (!paypalClientId || !paypalClientSecret) {
    res.status(503).json({ error: "PayPal is not configured. Add platform PayPal credentials in Admin → Payment Gateways." });
    return;
  }
  const paypalMode = (await resolveGatewayField("paypal", "mode")) ?? "live";
  const webhookId = await resolveGatewayField("paypal", "webhookId");

  const event = req.body as PayPalWebhookEvent;
  if (!event?.event_type || !event?.id) {
    res.status(400).json({ error: "Invalid PayPal webhook body" });
    return;
  }

  // Verify signature via PayPal's verification API
  const { verifyPayPalWebhookSignature } = await import("../../lib/paypal-catalog");
  const verified = await verifyPayPalWebhookSignature(
    paypalClientId,
    paypalClientSecret,
    paypalMode,
    webhookId,
    {
      transmissionId: req.headers["paypal-transmission-id"] as string ?? "",
      transmissionTime: req.headers["paypal-transmission-time"] as string ?? "",
      certUrl: req.headers["paypal-cert-url"] as string ?? "",
      transmissionSig: req.headers["paypal-transmission-sig"] as string ?? "",
      authAlgo: req.headers["paypal-auth-algo"] as string ?? "SHA256withRSA",
    },
    event,
  );

  if (!verified) {
    res.status(400).json({ error: "PayPal webhook signature verification failed" });
    return;
  }

  const eventId = `paypal-${event.id}`;

  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "paypal",
      eventType:  event.event_type,
      eventId,
      reference:  event.resource?.id ?? null,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processPayPalEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "paypal", event.event_type, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "paypal", eventType: event.event_type, process: fullPipeline });
      console.warn(`[paypal webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[paypal webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Background checker: stale events + stale sentinel cleanup ─────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS   = 60 * 1000;      // 1 minute

const alertedEventIds = new Set<string>();

async function checkStaleWebhookEvents(): Promise<void> {
  try {
    // ── 1. Reset timed-out in-progress sentinels ──────────────────────────────
    // Fetch rows whose errorMessage is a sentinel (handler claimed but never
    // completed, likely due to a crash).  Reset them to NULL so the atomic
    // claim UPDATE in logWebhookEvent can reclaim them on the next delivery.
    const inProgressRows = await db
      .select({ eventId: webhookEventsTable.eventId, errorMessage: webhookEventsTable.errorMessage })
      .from(webhookEventsTable)
      .where(
        sql`${webhookEventsTable.processedAt} IS NULL AND ${webhookEventsTable.errorMessage} LIKE '[in-progress:%'`,
      );

    for (const row of inProgressRows) {
      if (row.errorMessage && isSentinel(row.errorMessage) && isSentinelTimedOut(row.errorMessage)) {
        // Compare-and-swap: only reset if errorMessage is STILL the exact
        // sentinel we read.  If another handler claimed the event between our
        // SELECT and this UPDATE (writing a fresh sentinel), the WHERE won't
        // match and we leave the new claim untouched.
        const result = await db
          .update(webhookEventsTable)
          .set({ errorMessage: null })
          .where(
            sql`${webhookEventsTable.eventId} = ${row.eventId} AND ${webhookEventsTable.errorMessage} = ${row.errorMessage}`,
          )
          .returning({ id: webhookEventsTable.id });
        if (result.length > 0) {
          console.warn(`[webhook] timed-out in-progress sentinel reset — id=${row.eventId}`);
        }
      }
    }

    // ── 2. Alert on stale failed events ──────────────────────────────────────
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const stale = await db
      .select({
        eventId:      webhookEventsTable.eventId,
        provider:     webhookEventsTable.provider,
        eventType:    webhookEventsTable.eventType,
        errorMessage: webhookEventsTable.errorMessage,
        receivedAt:   webhookEventsTable.receivedAt,
      })
      .from(webhookEventsTable)
      .where(
        sql`${webhookEventsTable.processedAt} IS NULL AND ${webhookEventsTable.errorMessage} IS NOT NULL AND ${webhookEventsTable.errorMessage} NOT LIKE '[in-progress:%' AND ${webhookEventsTable.receivedAt} < ${cutoff}`,
      );

    for (const row of stale) {
      if (alertedEventIds.has(row.eventId)) continue;

      await sendSlackAlert(
        `⏰ *Stale unprocessed webhook event* (>5 min)\n` +
        `• Provider: \`${row.provider}\`\n` +
        `• Event type: \`${row.eventType}\`\n` +
        `• Event ID: \`${row.eventId}\`\n` +
        `• Received: ${row.receivedAt.toISOString()}\n` +
        `• Error: ${row.errorMessage}`,
      );

      alertedEventIds.add(row.eventId);
    }
  } catch (err) {
    console.error("[webhook] Background checker failed:", err);
  }
}

setTimeout(() => {
  void checkStaleWebhookEvents();
  setInterval(() => void checkStaleWebhookEvents(), POLL_INTERVAL_MS);
}, 10_000);

export default router;
