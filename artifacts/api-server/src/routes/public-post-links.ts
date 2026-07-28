/**
 * Public "shop this post" links — attached to a social post's caption so
 * customers who click through (no VendorHub account) can see the featured
 * products and either express interest or check out directly.
 *
 * GET  /public/post-links/:token             — vendor + product info for the link
 * POST /public/post-links/:token/interest    — capture a lead, no payment
 * POST /public/post-links/:token/checkout    — create an order + start a real payment
 * GET  /public/post-links/:token/orders/:orderId          — status of an order started via this link
 * POST /public/post-links/:token/orders/:orderId/retry    — retry payment for that order (same or different gateway)
 * POST /public/post-links/:token/orders/:orderId/cancel   — cancel an unpaid order
 *
 * Mounted before requireAuth in routes/index.ts, same as public-vendors.ts.
 * Prices are always re-read from the DB — never trusted from the client.
 */
import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, desc, sql } from "drizzle-orm";
import Stripe from "stripe";
import {
  db,
  postsTable,
  vendorsTable,
  productsTable,
  ordersTable,
  orderItemsTable,
  leadsTable,
  paymentsTable,
} from "@workspace/db";
import { resolveStripeKey, resolvePaystackKey, getPaymentMethodAvailability, type TierCheckable } from "../lib/vendor-keys";
import { GATEWAY_DEFS, getPlatformCredentials } from "../lib/platform-gateways";
import { sendCustomerOrderConfirmationEmail } from "../lib/customer-emails";
import { createRemitaCheckout } from "./payments/remita";
import { createFlutterwaveCheckout } from "./payments/flutterwave";
import { createNombaCheckout } from "./payments/nomba";
import { buildInterswitchPaymentUrl, resolveInterswitchCreds } from "../lib/interswitch";
import { getPayPalAccessToken, paypalBaseUrl } from "../lib/paypal-catalog";

const router: IRouter = Router();

const PAYSTACK_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES"]);
const PAYSTACK_BASE = "https://api.paystack.co";

type GatewayVendor = TierCheckable & {
  stripeEnabled: boolean;
  paystackEnabled: boolean;
  remitaEnabled: boolean;
  flutterwaveEnabled: boolean;
  nombaEnabled: boolean;
  paypalEnabled: boolean;
  interswitchEnabled: boolean;
};

type PostLinkProvider = "stripe" | "paystack" | "remita" | "flutterwave" | "nomba" | "paypal" | "interswitch";

const ALL_PROVIDERS: PostLinkProvider[] = ["paystack", "stripe", "paypal", "flutterwave", "nomba", "remita", "interswitch"];

/** Statuses from which a payment can still be superseded by a retry. Mirrors external/payments.ts. */
const OPEN_PAYMENT_STATUSES = new Set(["pending", "failed"]);

/**
 * Order payment statuses a retry may still be attempted from — explicitly
 * excludes "paid" and "refunded" (already resolved) as well as any other
 * non-recoverable status; only the exact "started but didn't finish" states
 * are retryable.
 */
const RETRYABLE_ORDER_PAYMENT_STATUSES = new Set(["unpaid", "failed"]);

/**
 * Loads an order strictly scoped to the specific shop-link (post) it was
 * created from — not just the vendor. A valid public token only ever proves
 * "this is the right vendor for this one post"; without also matching
 * sourcePostId, that token could be used to probe or retry *any* order for
 * the vendor (including ones never placed through this public flow) by
 * guessing ids.
 */
async function loadLinkOrder(vendorId: number, postId: number, orderId: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId), eq(ordersTable.sourcePostId, postId)));
  return order ?? null;
}

/** Every gateway the vendor has enabled, in the order customers should see them. */
function enabledProviders(vendor: GatewayVendor): PostLinkProvider[] {
  return ALL_PROVIDERS.filter((p) => vendor[`${p}Enabled` as const]);
}

export type UnavailableProvider = { provider: PostLinkProvider; label: string; reason: string };

/**
 * Splits the vendor's enabled gateways into ones that will actually work at
 * checkout right now vs. ones that are enabled but have no working platform
 * (or vendor-owned) credentials behind them — so both the shop-link page and
 * the vendor can see *why* an enabled method isn't offered, instead of only
 * discovering it via a generic 503 after "Continue to payment".
 */
async function resolveProviderAvailability(
  vendor: GatewayVendor,
  vendorId: number,
): Promise<{ available: PostLinkProvider[]; unavailable: UnavailableProvider[] }> {
  const enabled = enabledProviders(vendor);
  const results = await Promise.all(enabled.map((p) => getPaymentMethodAvailability(p, vendorId, vendor)));
  // getPaymentMethodAvailability returns GatewayProvider (which includes "paypal"),
  // but enabledProviders only returns PostLinkProvider values; cast is safe here.
  const available = results.filter((r) => r.available).map((r) => r.provider as PostLinkProvider);
  const unavailable = results
    .filter((r): r is typeof r & { reason: string } => !r.available)
    .map((r) => ({ provider: r.provider as PostLinkProvider, label: GATEWAY_DEFS[r.provider].label, reason: r.reason ?? "Not available." }));
  return { available, unavailable };
}

/**
 * Post-checkout redirect always goes back to the shop link itself — never a
 * client-supplied URL. Accepting an unauthenticated client's successUrl/
 * cancelUrl and forwarding it to Stripe/Paystack would be an open redirect.
 */
function shopLinkUrl(token: string, orderId?: number): string | null {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!domain) return null;
  const base = `https://${domain}/p/${token}`;
  return orderId ? `${base}?order=${orderId}` : base;
}

/** Default pick when the customer didn't choose (or chose something invalid). Only picks among providers that are actually available. */
function selectProvider(currency: string, available: PostLinkProvider[]): PostLinkProvider | null {
  const wantsPaystack = PAYSTACK_CURRENCIES.has(currency.toUpperCase());
  if (wantsPaystack && available.includes("paystack")) return "paystack";
  return available[0] ?? null;
}

type ChargeResult =
  | { ok: true; body: { orderId: number; provider: PostLinkProvider; url: string | null } }
  | { ok: false; status: number; error: string };

/**
 * Starts a real payment with the given provider for an order — shared by the
 * initial checkout and a retry, so both stay in sync. `lineItems` gives
 * Stripe per-product line items on first checkout; a retry (which no longer
 * has the original cart handy) falls back to a single line for the order
 * total, same as the /external/payments retry pattern.
 */
async function chargeProvider(params: {
  provider: PostLinkProvider;
  vendor: GatewayVendor & { id: number };
  orderId: number;
  amount: number;
  currency: string;
  email: string;
  phone?: string | null;
  name: string;
  redirectUrl: string;
  lineItems?: { productName: string; quantity: number; unitPrice: number }[];
}): Promise<ChargeResult> {
  const { provider, vendor, orderId, amount, currency, email, phone, name, redirectUrl, lineItems } = params;
  const description = `Order #${orderId}`;

  try {
    if (provider === "remita") {
      const result = await createRemitaCheckout({
        orderId,
        vendorId: vendor.id,
        amount,
        currency,
        payerName: name,
        payerEmail: email,
        payerPhone: phone ?? undefined,
        description,
      });
      if (!result.ok) return { ok: false, status: result.status, error: result.error };
      return { ok: true, body: { orderId, provider: "remita", url: result.url } };
    }

    if (provider === "flutterwave") {
      const result = await createFlutterwaveCheckout({ orderId, vendorId: vendor.id, amount, currency, email, redirectUrl, description });
      if (!result.ok) return { ok: false, status: result.status, error: result.error };
      return { ok: true, body: { orderId, provider: "flutterwave", url: result.url } };
    }

    if (provider === "nomba") {
      const result = await createNombaCheckout({ orderId, vendorId: vendor.id, amount, currency, email, callbackUrl: redirectUrl, description });
      if (!result.ok) return { ok: false, status: result.status, error: result.error };
      return { ok: true, body: { orderId, provider: "nomba", url: result.url } };
    }

    if (provider === "interswitch") {
      try {
        const creds = resolveInterswitchCreds();
        const transactionRef = `IS-${vendor.id}-${Date.now()}`;
        const amountKobo = Math.round(amount * 100);
        const currencyCode = currency === "USD" ? "840" : "566";
        const { checkoutUrl } = buildInterswitchPaymentUrl(creds, {
          transactionRef, amount: amountKobo, customerId: email, customerEmail: email,
          callbackUrl: redirectUrl, currencyCode,
        });
        // Record the pending payment for webhook / requery reconciliation
        await _db2.insert(_pt2).values({
          vendorId: vendor.id, orderId,
          provider: "interswitch",
          providerReference: transactionRef,
          amount: String(amount),
          currency,
          status: "pending",
          checkoutUrl,
          metadata: { email },
        }).onConflictDoNothing();
        return { ok: true, body: { orderId, provider: "interswitch", url: checkoutUrl } };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Interswitch is not configured";
        return { ok: false, status: 503, error: msg };
      }
    }

    if (provider === "paypal") {
      const creds = await getPlatformCredentials("paypal");
      const clientId = creds?.clientId || process.env.PAYPAL_CLIENT_ID;
      const clientSecret = creds?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return { ok: false, status: 503, error: "PayPal is not configured on the platform." };
      }
      const mode = (creds?.mode as "sandbox" | "live" | undefined) ?? "live";
      const base = paypalBaseUrl(mode);
      let ppToken: string;
      try {
        ppToken = await getPayPalAccessToken(clientId, clientSecret, mode);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 503, error: `PayPal auth failed: ${msg}` };
      }

      const orderPayload = {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: currency.toUpperCase(), value: amount.toFixed(2) },
            description,
            custom_id: JSON.stringify({ orderId, vendorId: vendor.id }),
          },
        ],
        application_context: {
          brand_name: "Awa Biz Suite",
          return_url: redirectUrl,
          cancel_url: redirectUrl,
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      };

      const ppResponse = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ppToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": `vendorhub-spl-${orderId}-${Date.now()}`,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!ppResponse.ok) {
        const text = await ppResponse.text().catch(() => "(no body)");
        return { ok: false, status: 502, error: `PayPal create order failed (${ppResponse.status}): ${text}` };
      }

      const ppData = (await ppResponse.json()) as {
        id: string;
        links?: Array<{ rel: string; href: string }>;
      };

      const approvalUrl = ppData.links?.find((l) => l.rel === "approve")?.href;
      if (!approvalUrl) {
        return { ok: false, status: 502, error: "PayPal order created but no approval URL in response" };
      }

      await db.insert(paymentsTable).values({
        orderId,
        vendorId: vendor.id,
        provider: "paypal",
        providerReference: ppData.id,
        amount: amount.toString(),
        currency: currency.toUpperCase(),
        status: "pending",
        metadata: { paypalOrderId: ppData.id, approvalUrl, source: "social_post" },
      });

      return { ok: true, body: { orderId, provider: "paypal", url: approvalUrl } };
    }

    if (provider === "stripe") {
      const stripeKey = await resolveStripeKey(vendor.id, vendor);
      const stripe = new Stripe(stripeKey);
      const items = lineItems ?? [{ productName: description, quantity: 1, unitPrice: amount }];
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: email,
        line_items: items.map((i) => ({
          quantity: i.quantity,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(i.unitPrice * 100),
            product_data: { name: i.productName },
          },
        })),
        success_url: redirectUrl,
        cancel_url: redirectUrl,
        metadata: { orderId: orderId.toString(), vendorId: vendor.id.toString(), source: "social_post" },
      });

      await db.insert(paymentsTable).values({
        orderId,
        vendorId: vendor.id,
        provider: "stripe",
        providerReference: session.id,
        amount: amount.toString(),
        currency,
        status: "pending",
        metadata: { sessionId: session.id, sessionUrl: session.url, source: "social_post" },
      });

      return { ok: true, body: { orderId, provider: "stripe", url: session.url } };
    }

    // ── Paystack ──────────────────────────────────────────────────────────
    const paystackKey = await resolvePaystackKey(vendor.id, vendor);
    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        currency,
        callback_url: redirectUrl,
        metadata: { orderId: orderId.toString(), vendorId: vendor.id.toString(), source: "social_post" },
      }),
    });
    const data = (await paystackRes.json()) as {
      status: boolean; message: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!data.status || !data.data) return { ok: false, status: 502, error: `Paystack error: ${data.message}` };

    await db.insert(paymentsTable).values({
      orderId,
      vendorId: vendor.id,
      provider: "paystack",
      providerReference: data.data.reference,
      amount: amount.toString(),
      currency,
      status: "pending",
      metadata: { reference: data.data.reference, authorization_url: data.data.authorization_url, source: "social_post" },
    });
    return { ok: true, body: { orderId, provider: "paystack", url: data.data.authorization_url } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 503, error: msg };
  }
}

/**
 * Best-effort void of a superseded payment's provider-side checkout session,
 * mirroring /external/payments's voidProviderSession — Stripe supports
 * expiring an open session; Paystack has no equivalent API so it's a no-op
 * there (the stale authorization link just stops being honored locally).
 */
async function voidProviderSession(
  vendor: GatewayVendor & { id: number },
  payment: { id: number; provider: string; providerReference: string; metadata: unknown },
): Promise<void> {
  if (payment.provider !== "stripe") return;
  try {
    const stripeKey = await resolveStripeKey(vendor.id, vendor);
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(payment.providerReference);
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(payment.providerReference);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[public-post-links] failed to void stripe checkout session for payment=${payment.id} reference=${payment.providerReference}:`,
      message,
    );
    await db
      .update(paymentsTable)
      .set({
        metadata: {
          ...((payment.metadata ?? {}) as Record<string, unknown>),
          voidError: message,
          voidErrorAt: new Date().toISOString(),
        },
      })
      .where(eq(paymentsTable.id, payment.id));
  }
}

async function loadLink(token: string) {
  const [post] = await db.select().from(postsTable).where(eq(postsTable.shareToken, token));
  if (!post || post.linkMode === "none" || post.productIds.length === 0) return null;
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, post.vendorId));
  if (!vendor || vendor.status !== "active") return null;
  // Always scope by vendorId too — a post must never be able to surface another
  // vendor's products even if productIds were ever tampered with or stale.
  const products = await db
    .select()
    .from(productsTable)
    .where(and(inArray(productsTable.id, post.productIds), eq(productsTable.vendorId, post.vendorId)));
  return { post, vendor, products: products.filter((p) => p.status === "active") };
}

router.get("/public/post-links/:token", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }
  const { post, vendor, products } = link;
  const { available, unavailable } = await resolveProviderAvailability(vendor, vendor.id);
  res.json({
    linkMode: post.linkMode,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      logoUrl: vendor.logoUrl,
      brandTheme: vendor.brandTheme,
      defaultCurrency: vendor.defaultCurrency ?? "USD",
      availableProviders: available,
      unavailableProviders: unavailable,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: parseFloat(p.price),
      imageUrl: p.imageUrl,
      unit: p.unit,
      inStock: p.stockQuantity > 0,
    })),
  });
});

router.post("/public/post-links/:token/interest", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }
  if (link.post.linkMode !== "interest") { res.status(400).json({ error: "This link does not accept interest submissions" }); return; }

  const { name, email, phone, message, productId } = req.body as {
    name?: string; email?: string; phone?: string; message?: string; productId?: number;
  };
  if (!name || (!email && !phone)) {
    res.status(400).json({ error: "name and at least one of email/phone are required" });
    return;
  }
  const matchedProductId = productId && link.products.some((p) => p.id === productId) ? productId : null;

  const [lead] = await db.insert(leadsTable).values({
    vendorId: link.vendor.id,
    name,
    email: email ?? null,
    phone: phone ?? null,
    notes: message ?? null,
    source: "social_post",
    productId: matchedProductId,
    status: "new",
  }).returning();

  res.status(201).json({ success: true, leadId: lead!.id });
});

router.post("/public/post-links/:token/checkout", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }
  if (link.post.linkMode !== "checkout") { res.status(400).json({ error: "This link does not accept checkout" }); return; }

  const { name, email, phone, address, items, provider: requestedProvider } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    items?: { productId: number; quantity: number }[];
    provider?: string;
  };

  if (!name || !email || !items?.length) {
    res.status(400).json({ error: "name, email and items are required" });
    return;
  }
  if (!address?.trim()) {
    res.status(400).json({ error: "Delivery address is required" });
    return;
  }

  // Merge duplicate productId entries first — otherwise multiple lines under the
  // per-line stock limit could still combine to request more than is in stock.
  const quantityByProduct = new Map<number, number>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      res.status(400).json({ error: `Invalid quantity for product ${item.productId}` });
      return;
    }
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + quantity);
  }

  const orderItems: { productId: number; productName: string; quantity: number; unitPrice: number }[] = [];
  for (const [productId, quantity] of quantityByProduct) {
    const product = link.products.find((p) => p.id === productId);
    if (!product) {
      res.status(400).json({ error: `Invalid item for product ${productId}` });
      return;
    }
    if (product.stockQuantity < quantity) {
      res.status(409).json({ error: `${product.name} does not have enough stock available` });
      return;
    }
    orderItems.push({ productId: product.id, productName: product.name, quantity, unitPrice: parseFloat(product.price) });
  }

  const totalAmount = orderItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const currency = (link.vendor.defaultCurrency ?? "USD").toUpperCase();

  // Resolve availability — and reject before creating an order — so a
  // customer never gets a generic 503 after we've already recorded an order
  // for them, and always sees the specific reason a chosen method won't work.
  const { available, unavailable } = await resolveProviderAvailability(link.vendor, link.vendor.id);

  let provider: PostLinkProvider | null = null;
  if (requestedProvider) {
    if (available.includes(requestedProvider as PostLinkProvider)) {
      provider = requestedProvider as PostLinkProvider;
    } else {
      const badReason = unavailable.find((u) => u.provider === requestedProvider);
      res.status(503).json({
        error: badReason
          ? `${badReason.label} isn't available right now: ${badReason.reason}`
          : "The selected payment method is not available for this vendor.",
      });
      return;
    }
  } else {
    provider = selectProvider(currency, available);
  }

  if (!provider) {
    res.status(503).json({
      error:
        unavailable.length > 0
          ? `This vendor's payment method${unavailable.length > 1 ? "s aren't" : " isn't"} working right now: ${unavailable
              .map((u) => `${u.label} (${u.reason})`)
              .join("; ")}`
          : "This vendor has no payment method configured yet.",
    });
    return;
  }

  const [order] = await db.insert(ordersTable).values({
    vendorId:        link.vendor.id,
    sourcePostId:    link.post.id,
    customerName:    name,
    customerEmail:   email,
    customerPhone:   phone ?? null,
    shippingAddress: address!.trim(),
    status:          "pending",
    paymentStatus:   "unpaid",
    currency:        link.vendor.defaultCurrency ?? "USD",
    totalAmount:     totalAmount.toString(),
    notes:           `Placed via social post link`,
  }).returning();

  await db.insert(orderItemsTable).values(
    orderItems.map((i) => ({
      orderId: order!.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toString(),
      totalPrice: (i.quantity * i.unitPrice).toString(),
    })),
  );

  // Fire-and-forget order confirmation + profile CTA email
  sendCustomerOrderConfirmationEmail({
    customerEmail:   email,
    customerName:    name,
    orderId:         order!.id,
    vendorName:      link.vendor.businessName ?? link.vendor.name ?? "Your vendor",
    items:           orderItems.map((i) => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
    totalAmount,
    currency,
    shippingAddress: address!.trim(),
  }).catch(() => {});

  // Atomically decrement stock for every item in a transaction.
  // The WHERE stock_quantity >= quantity guard means two concurrent checkouts
  // can't both succeed for the last unit — one will get 0 rows returned and
  // we cancel the order before it ever reaches the payment gateway.
  try {
    await db.transaction(async (tx) => {
      for (const item of orderItems) {
        if (item.quantity <= 0) continue; // non-stock items
        const [dec] = await tx
          .update(productsTable)
          .set({ stockQuantity: sql`${productsTable.stockQuantity} - ${item.quantity}` })
          .where(and(eq(productsTable.id, item.productId), gte(productsTable.stockQuantity, item.quantity)))
          .returning({ id: productsTable.id });
        if (!dec) {
          // Another concurrent request took the remaining stock between our
          // initial read and this atomic UPDATE — surface a clear error.
          throw new Error(`STOCK_DEPLETED:${item.productName}`);
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("STOCK_DEPLETED:")) {
      const productName = err.message.slice("STOCK_DEPLETED:".length);
      // Clean up the order we already created
      await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, order!.id)).catch(() => null);
      await db.delete(ordersTable).where(eq(ordersTable.id, order!.id)).catch(() => null);
      res.status(409).json({ error: `${productName} just sold out — please try again or choose a different quantity.` });
      return;
    }
    throw err;
  }

  const redirectUrl = shopLinkUrl(req.params.token, order!.id);
  if (!redirectUrl) {
    res.status(503).json({ error: "Checkout is temporarily unavailable." });
    return;
  }

  const chargeResult = await chargeProvider({
    provider,
    vendor: link.vendor,
    orderId: order!.id,
    amount: totalAmount,
    currency,
    email,
    phone,
    name,
    redirectUrl,
    lineItems: orderItems.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
  });
  if (!chargeResult.ok) { res.status(chargeResult.status).json({ error: chargeResult.error }); return; }
  res.json(chargeResult.body);
});

/**
 * GET /public/post-links/:token/orders/:orderId
 * Lets the shop-link page — after redirecting back from a gateway that
 * failed or was abandoned — check whether the order is still unpaid and
 * worth offering a retry for. Scoped by the link token AND the exact post
 * that order was placed through (see loadLinkOrder) — never just the
 * vendor — so a valid token for one post can't be used to probe orders it
 * didn't create.
 */
router.get("/public/post-links/:token/orders/:orderId", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }

  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const order = await loadLinkOrder(link.vendor.id, link.post.id, orderId);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const { available, unavailable } = await resolveProviderAvailability(link.vendor, link.vendor.id);

  const isOpenUnpaid =
    order.status !== "cancelled" && RETRYABLE_ORDER_PAYMENT_STATUSES.has(order.paymentStatus);

  res.json({
    orderId: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: parseFloat(order.totalAmount),
    currency: order.currency,
    canRetry: isOpenUnpaid && available.length > 0,
    canCancel: isOpenUnpaid,
    availableProviders: available,
    unavailableProviders: unavailable,
  });
});

/**
 * POST /public/post-links/:token/orders/:orderId/retry
 * Retries payment for an order whose first attempt failed or was abandoned,
 * instead of forcing the customer to start over and leaving an orphaned
 * pending order behind. Optionally switches to a different enabled gateway
 * (`provider` in the body). Mirrors /external/payments/:id/retry: the prior
 * open payment (if any) is voided where supported and marked cancelled so
 * it can't also be paid.
 */
router.post("/public/post-links/:token/orders/:orderId/retry", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }
  if (link.post.linkMode !== "checkout") { res.status(400).json({ error: "This link does not accept checkout" }); return; }

  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const order = await loadLinkOrder(link.vendor.id, link.post.id, orderId);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order.status === "cancelled") { res.status(409).json({ error: "This order was cancelled and can no longer be retried" }); return; }
  if (!RETRYABLE_ORDER_PAYMENT_STATUSES.has(order.paymentStatus)) {
    res.status(409).json({ error: `This order is ${order.paymentStatus} and can no longer be retried` });
    return;
  }

  const { provider } = req.body as { provider?: string };

  const currency = (order.currency ?? link.vendor.defaultCurrency ?? "USD").toUpperCase();
  const { available, unavailable } = await resolveProviderAvailability(link.vendor, link.vendor.id);

  let chosenProvider: PostLinkProvider | null = null;
  if (provider) {
    if (available.includes(provider as PostLinkProvider)) {
      chosenProvider = provider as PostLinkProvider;
    } else {
      const badReason = unavailable.find((u) => u.provider === provider);
      res.status(503).json({
        error: badReason
          ? `${badReason.label} isn't available right now: ${badReason.reason}`
          : "The selected payment method is not available for this vendor.",
      });
      return;
    }
  } else {
    chosenProvider = selectProvider(currency, available);
  }

  if (!chosenProvider) {
    res.status(503).json({
      error:
        unavailable.length > 0
          ? `This vendor's payment method${unavailable.length > 1 ? "s aren't" : " isn't"} working right now: ${unavailable
              .map((u) => `${u.label} (${u.reason})`)
              .join("; ")}`
          : "This vendor has no payment method configured yet.",
    });
    return;
  }

  const redirectUrl = shopLinkUrl(req.params.token, order.id);
  if (!redirectUrl) {
    res.status(503).json({ error: "Checkout is temporarily unavailable." });
    return;
  }

  const [priorPayment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, order.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  const chargeResult = await chargeProvider({
    provider: chosenProvider,
    vendor: link.vendor,
    orderId: order.id,
    amount: parseFloat(order.totalAmount),
    currency,
    email: order.customerEmail,
    phone: order.customerPhone,
    name: order.customerName,
    redirectUrl,
  });
  if (!chargeResult.ok) { res.status(chargeResult.status).json({ error: chargeResult.error }); return; }

  if (priorPayment && OPEN_PAYMENT_STATUSES.has(priorPayment.status)) {
    await voidProviderSession(link.vendor, priorPayment);
    await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, priorPayment.id));
  }

  res.json(chargeResult.body);
});

/**
 * POST /public/post-links/:token/orders/:orderId/paypal-capture
 * Called by the public shop page after PayPal redirects back with ?token=ORDER_ID.
 * Scoped by the shop-link token AND orderId so only a customer who knows both
 * can trigger a capture for an order placed through that specific link.
 *
 * Credentials follow the same env-fallback path used at checkout.
 */
router.post("/public/post-links/:token/orders/:orderId/paypal-capture", async (req, res): Promise<void> => {
  const { paypalOrderId } = req.body as { paypalOrderId?: string };
  if (!paypalOrderId) {
    res.status(400).json({ error: "paypalOrderId is required" });
    return;
  }

  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }

  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const order = await loadLinkOrder(link.vendor.id, link.post.id, orderId);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Locate the pending PayPal payment row, verified to belong to this order
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.providerReference, paypalOrderId), eq(paymentsTable.orderId, orderId)));

  if (!payment) {
    res.status(404).json({ error: "No PayPal payment found for this order" });
    return;
  }
  if (payment.status === "paid") {
    res.json({ success: true, paymentId: payment.id, status: "paid" });
    return;
  }
  if (payment.status === "cancelled") {
    res.status(409).json({ error: "This payment was cancelled and cannot be captured" });
    return;
  }

  const creds = await getPlatformCredentials("paypal");
  const clientId = creds?.clientId || process.env.PAYPAL_CLIENT_ID;
  const clientSecret = creds?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(503).json({ error: "PayPal is not configured on the platform." });
    return;
  }

  const mode = (creds?.mode ?? "live") as string;
  const base = paypalBaseUrl(mode);

  let ppToken: string;
  try {
    ppToken = await getPayPalAccessToken(clientId, clientSecret, mode);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `PayPal auth failed: ${msg}` });
    return;
  }

  const captureRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ppToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `vendorhub-spl-capture-${paypalOrderId}`,
    },
    body: JSON.stringify({}),
  });

  if (!captureRes.ok) {
    const text = await captureRes.text().catch(() => "(no body)");
    res.status(502).json({ error: `PayPal capture failed (${captureRes.status}): ${text}` });
    return;
  }

  const captureData = (await captureRes.json()) as {
    status: string;
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id: string; status: string }> };
    }>;
  };

  const captureStatus = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  if (captureData.status !== "COMPLETED" && captureStatus !== "COMPLETED") {
    res.status(502).json({ error: `PayPal capture status is ${captureData.status ?? captureStatus ?? "unknown"}` });
    return;
  }

  const [updated] = await db
    .update(paymentsTable)
    .set({ status: "paid", updatedAt: new Date() })
    .where(and(eq(paymentsTable.providerReference, paypalOrderId), eq(paymentsTable.orderId, orderId)))
    .returning({ id: paymentsTable.id, vendorId: paymentsTable.vendorId, orderId: paymentsTable.orderId, amount: paymentsTable.amount, currency: paymentsTable.currency });

  if (updated?.orderId) {
    await db
      .update(ordersTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(ordersTable.id, updated.orderId));
  }

  if (updated) {
    const { syncSaleFromPayment } = await import("../lib/sales-sync");
    await syncSaleFromPayment({
      id: payment.id,
      vendorId: updated.vendorId,
      amount: updated.amount,
      currency: updated.currency,
    });
  }

  console.info(`[paypal public-capture] COMPLETED — paypalOrderId=${paypalOrderId} orderId=${orderId} paymentId=${payment.id}`);
  res.json({ success: true, paymentId: payment.id, status: "paid" });
});

/**
 * POST /public/post-links/:token/orders/:orderId/cancel
 * Lets a customer explicitly cancel an unpaid shop-link order that is stuck
 * in pending — instead of it sitting there indefinitely. Scoped by token +
 * post (same as the retry endpoint). Voids the open provider session where
 * supported (Stripe only) before marking everything cancelled.
 */
router.post("/public/post-links/:token/orders/:orderId/cancel", async (req, res): Promise<void> => {
  const link = await loadLink(req.params.token);
  if (!link) { res.status(404).json({ error: "Link not found or no longer available" }); return; }

  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  const order = await loadLinkOrder(link.vendor.id, link.post.id, orderId);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.status === "cancelled") {
    res.status(409).json({ error: "This order is already cancelled" });
    return;
  }
  if (!RETRYABLE_ORDER_PAYMENT_STATUSES.has(order.paymentStatus)) {
    res.status(409).json({ error: `This order is ${order.paymentStatus} and cannot be cancelled` });
    return;
  }

  // Void the most recent open provider session before marking cancelled so the
  // customer can't be charged after they've explicitly given up.
  const [latestPayment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.orderId, order.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  if (latestPayment && OPEN_PAYMENT_STATUSES.has(latestPayment.status)) {
    await voidProviderSession(link.vendor, latestPayment);
    await db.update(paymentsTable).set({ status: "cancelled" }).where(eq(paymentsTable.id, latestPayment.id));
  }

  await db
    .update(ordersTable)
    .set({ status: "cancelled", paymentStatus: "cancelled" })
    .where(eq(ordersTable.id, order.id));

  // Restore stock for every item in the cancelled order — stock was decremented
  // at checkout time (before the payment attempt) so a failed or abandoned
  // checkout doesn't permanently consume inventory.
  try {
    const items = await db
      .select({ productId: orderItemsTable.productId, quantity: orderItemsTable.quantity })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));

    for (const item of items) {
      await db
        .update(productsTable)
        .set({ stockQuantity: sql`${productsTable.stockQuantity} + ${item.quantity}` })
        .where(eq(productsTable.id, item.productId));
    }
  } catch (restoreErr) {
    // Log but don't fail the cancel — the order is already cancelled; stock
    // reconciliation can be done manually if this ever fires.
    console.error("[post-links cancel] Failed to restore stock for cancelled order:", restoreErr);
  }

  res.json({ success: true, orderId: order.id });
});

export default router;
