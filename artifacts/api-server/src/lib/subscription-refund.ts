/**
 * Subscription cancellation refund + blacklist logic.
 *
 * When a vendor cancels a paid subscription within REFUND_WINDOW_DAYS (10) days
 * of the current billing period start, we:
 *  1. Refund the most recent subscription payment via the original gateway.
 *  2. Insert a row into subscription_refund_blacklist so the vendor can only
 *     re-subscribe to a tier strictly above the one they just refunded.
 *  3. Send the vendor an in-app notification and email explaining what happened.
 *
 * Always fire-and-forget from webhook handlers — failures are logged but never
 * propagated so the downgrade path that called us is never blocked.
 */
import { db } from "@workspace/db";
import { subscriptionRefundBlacklistTable, vendorNotificationsTable } from "@workspace/db/schema";
import { callWithPlatformStripe, resolveGatewayField, getPlatformCredentials } from "./platform-gateways";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

export const REFUND_WINDOW_DAYS = 10;

export const TIER_RANK: Record<string, number> = {
  free: 0, starter: 1, pro: 2, enterprise: 3,
};

const TIER_BY_RANK: Record<number, string> = {
  0: "free", 1: "starter", 2: "pro", 3: "enterprise",
};

const PAYSTACK_BASE = "https://api.paystack.co";

// ── Public interface ──────────────────────────────────────────────────────────

export interface VendorForRefund {
  id: number;
  name: string;
  email: string | null;
  subscriptionTier: string;
  currentPeriodStart: Date | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  paystackSubscriptionCode?: string | null;
  paypalSubscriptionId?: string | null;
}

/**
 * Context specific to each gateway that helps locate the payment to refund.
 */
export interface RefundContext {
  /** Stripe: the full Stripe.Subscription object delivered via webhook. */
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  /** Paystack: transaction reference from event.data.most_recent_invoice.transaction.reference */
  paystackTransactionRef?: string | null;
  /** PayPal: the subscription ID — used to look up the latest transaction. */
  paypalSubscriptionId?: string | null;
}

export interface RefundResult {
  refunded: boolean;
  refundReference?: string;
  skippedReason?: string;
}

// ── Core helper ───────────────────────────────────────────────────────────────

/**
 * Checks whether the vendor's current subscription started within the
 * 10-day refund window, and if so, issues a refund + blacklists the vendor.
 *
 * Returns immediately (never throws) — all errors are caught and logged.
 * Should be called fire-and-forget from cancellation webhook handlers.
 */
export async function maybeRefundSubscriptionCancellation(
  vendor: VendorForRefund,
  gateway: "stripe" | "paystack" | "paypal",
  ctx: RefundContext = {},
): Promise<RefundResult> {
  const refundedTier = vendor.subscriptionTier;
  const currentRank = TIER_RANK[refundedTier] ?? 0;

  // Free tier — nothing to refund.
  if (currentRank === 0) {
    return { refunded: false, skippedReason: "vendor is already on the free tier" };
  }

  // ── 10-day window check ───────────────────────────────────────────────────
  const now = new Date();
  const periodStart = vendor.currentPeriodStart ?? now;
  const daysSinceStart =
    (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceStart > REFUND_WINDOW_DAYS) {
    logger.info(
      { vendorId: vendor.id, daysSinceStart: daysSinceStart.toFixed(1), gateway },
      "[subscription-refund] Outside 10-day window — no refund issued",
    );
    return { refunded: false, skippedReason: `${daysSinceStart.toFixed(1)} days into subscription (window is ${REFUND_WINDOW_DAYS} days)` };
  }

  logger.info(
    { vendorId: vendor.id, daysSinceStart: daysSinceStart.toFixed(1), tier: refundedTier, gateway },
    "[subscription-refund] Within 10-day window — initiating refund",
  );

  // ── Issue the refund ──────────────────────────────────────────────────────
  let refundReference: string | undefined;

  try {
    if (gateway === "stripe") {
      refundReference = await refundStripeSubscription(ctx);
    } else if (gateway === "paystack") {
      refundReference = await refundPaystackSubscription(ctx);
    } else if (gateway === "paypal") {
      refundReference = await refundPayPalSubscription(ctx);
    }
  } catch (err) {
    logger.error(
      { err, vendorId: vendor.id, gateway },
      "[subscription-refund] Gateway refund failed — blacklisting anyway (funds may need manual return)",
    );
    // Still blacklist even if the gateway call failed — an admin can manually
    // process the refund. The important thing is to enforce the re-subscription rule.
  }

  // ── Blacklist the vendor ──────────────────────────────────────────────────
  const minAllowedRank = Math.min(currentRank + 1, 3); // cap at enterprise (rank 3)
  const minAllowedTier = TIER_BY_RANK[minAllowedRank] ?? "enterprise";

  try {
    await db.insert(subscriptionRefundBlacklistTable).values({
      vendorId: vendor.id,
      refundedTier,
      minAllowedTier,
      minAllowedTierRank: minAllowedRank,
      gateway,
      refundReference: refundReference ?? null,
      refundedAt: now,
    });
    logger.info(
      { vendorId: vendor.id, refundedTier, minAllowedTier, gateway },
      "[subscription-refund] Vendor blacklisted — can only subscribe to tiers above refunded tier",
    );
  } catch (err) {
    logger.error({ err, vendorId: vendor.id }, "[subscription-refund] Failed to insert blacklist row");
  }

  // ── In-app notification ───────────────────────────────────────────────────
  try {
    const tierLabel = refundedTier.charAt(0).toUpperCase() + refundedTier.slice(1);
    const minLabel = minAllowedTier === "enterprise"
      ? "Enterprise"
      : minAllowedTier.charAt(0).toUpperCase() + minAllowedTier.slice(1);

    await db.insert(vendorNotificationsTable).values({
      vendorId: vendor.id,
      type: "subscription",
      message: `Your ${tierLabel} subscription was refunded (cancelled within ${REFUND_WINDOW_DAYS} days). ` +
        `You can re-subscribe to the ${minLabel} plan or higher.`,
    });
  } catch (err) {
    logger.error({ err, vendorId: vendor.id }, "[subscription-refund] Failed to insert in-app notification");
  }

  // ── Email notification ────────────────────────────────────────────────────
  if (vendor.email) {
    try {
      await sendRefundNotificationEmail(vendor, refundedTier, minAllowedTier, gateway, refundReference);
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "[subscription-refund] Failed to send refund email");
    }
  }

  return { refunded: true, refundReference };
}

// ── Gateway-specific refund calls ─────────────────────────────────────────────

async function refundStripeSubscription(ctx: RefundContext): Promise<string | undefined> {
  let refundId: string | undefined;

  await callWithPlatformStripe(async (stripe) => {
    if (!ctx.stripeCustomerId) throw new Error("No stripeCustomerId in refund context");

    // Find the most recent paid invoice for this subscription (or customer if no sub ID).
    const listParams: Parameters<typeof stripe.invoices.list>[0] = {
      customer: ctx.stripeCustomerId,
      status: "paid",
      limit: 1,
    };
    if (ctx.stripeSubscriptionId) {
      listParams.subscription = ctx.stripeSubscriptionId;
    }

    const invoices = await stripe.invoices.list(listParams);
    const invoice = invoices.data[0];

    if (!invoice) {
      throw new Error("No paid invoice found for this Stripe subscription");
    }

    // payment_intent is a string (unexpanded) or PaymentIntent object; cast via any
    // for SDK version compatibility.
    const rawPi = (invoice as unknown as Record<string, unknown>).payment_intent;
    const paymentIntentId =
      typeof rawPi === "string" ? rawPi : (rawPi as { id?: string } | null)?.id ?? null;

    if (!paymentIntentId) {
      throw new Error("Stripe invoice has no associated PaymentIntent");
    }

    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    refundId = refund.id;
    logger.info({ refundId, paymentIntentId }, "[subscription-refund] Stripe refund created");
  });

  return refundId;
}

async function refundPaystackSubscription(ctx: RefundContext): Promise<string | undefined> {
  if (!ctx.paystackTransactionRef) {
    throw new Error("No Paystack transaction reference in refund context");
  }

  const paystackKey = await resolveGatewayField("paystack", "secretKey");
  if (!paystackKey) throw new Error("Paystack secret key not configured");

  const res = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction: ctx.paystackTransactionRef }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status: boolean;
    message: string;
    data?: { id?: number; refund_reference?: string };
  };

  if (!data.status) {
    throw new Error(`Paystack refund API error: ${data.message}`);
  }

  const refundId = data.data?.refund_reference ?? String(data.data?.id ?? "");
  logger.info({ refundId, transactionRef: ctx.paystackTransactionRef }, "[subscription-refund] Paystack refund created");
  return refundId || undefined;
}

async function refundPayPalSubscription(ctx: RefundContext): Promise<string | undefined> {
  if (!ctx.paypalSubscriptionId) {
    throw new Error("No PayPal subscription ID in refund context");
  }

  const creds = await getPlatformCredentials("paypal");
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new Error("PayPal platform credentials not configured");
  }

  const { getPayPalAccessToken, paypalBaseUrl } = await import("./paypal-catalog");
  const mode = (creds.mode ?? "live") as "sandbox" | "live";
  const base = paypalBaseUrl(mode);
  const token = await getPayPalAccessToken(creds.clientId, creds.clientSecret, mode);

  // Get the most recent completed transaction for this subscription.
  // PayPal subscription transactions endpoint (v1 API):
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days back

  const txRes = await fetch(
    `${base}/v1/billing/subscriptions/${ctx.paypalSubscriptionId}/transactions?start_time=${startTime}&end_time=${endTime}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!txRes.ok) {
    const text = await txRes.text().catch(() => "(no body)");
    throw new Error(`PayPal subscription transactions fetch failed (${txRes.status}): ${text}`);
  }

  const txData = (await txRes.json()) as {
    transactions?: Array<{
      id: string;
      status: string;
      amount_with_breakdown?: { gross_amount?: { value?: string } };
    }>;
  };

  const latestCompleted = txData.transactions?.find((t) => t.status === "COMPLETED");
  if (!latestCompleted) {
    throw new Error("No COMPLETED PayPal subscription transaction found to refund");
  }

  // Refund the capture using the v2 captures endpoint (works for both checkout and subscription captures).
  const refundRes = await fetch(`${base}/v2/payments/captures/${latestCompleted.id}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!refundRes.ok) {
    const text = await refundRes.text().catch(() => "(no body)");
    throw new Error(`PayPal refund failed (${refundRes.status}): ${text}`);
  }

  const refundData = (await refundRes.json()) as { id?: string };
  logger.info({ refundId: refundData.id, saleId: latestCompleted.id }, "[subscription-refund] PayPal refund created");
  return refundData.id;
}

// ── Email helper ──────────────────────────────────────────────────────────────

async function sendRefundNotificationEmail(
  vendor: VendorForRefund,
  refundedTier: string,
  minAllowedTier: string,
  gateway: string,
  refundReference?: string,
): Promise<void> {
  const tierLabel = refundedTier.charAt(0).toUpperCase() + refundedTier.slice(1);
  const minLabel = minAllowedTier.charAt(0).toUpperCase() + minAllowedTier.slice(1);
  const gatewayLabel =
    gateway === "stripe" ? "Stripe (card)" : gateway === "paystack" ? "Paystack" : "PayPal";

  const bodyHtml = `
    <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">Subscription Refunded</h1>

    <p style="font-size:14px;line-height:1.6;color:#444;">
      Hi ${escapeHtml(vendor.name)}, your <strong>${escapeHtml(tierLabel)}</strong> subscription was
      cancelled within the ${REFUND_WINDOW_DAYS}-day refund window, so a full refund has been initiated via
      <strong>${escapeHtml(gatewayLabel)}</strong>.
    </p>

    ${refundReference ? `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <span style="font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Refund reference</span>
      <div style="font-size:13px;color:#111827;font-family:monospace;margin-top:4px;">${escapeHtml(refundReference)}</div>
    </div>` : ""}

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#9a3412;">⚠️ Subscription Re-enrolment Restriction</p>
      <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#7c2d12;">
        Due to our refund policy, your account can only re-subscribe to the
        <strong>${escapeHtml(minLabel)}</strong> plan or higher. You cannot re-subscribe to
        the ${escapeHtml(tierLabel)} plan or any lower-tier plan.
      </p>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#444;">
      Refunds typically appear within 5–10 business days depending on your bank.
      If you believe this restriction was applied in error, please contact our support team.
    </p>`;

  const html = wrapVendorEmail({ bodyHtml });
  const result = await sendEmail({
    to: vendor.email!,
    subject: `Your ${tierLabel} subscription has been refunded`,
    html,
  });

  if (result.status !== "sent") {
    logger.warn(
      { vendorId: vendor.id, reason: result.error },
      "[subscription-refund] Refund notification email did not send",
    );
  }
}
