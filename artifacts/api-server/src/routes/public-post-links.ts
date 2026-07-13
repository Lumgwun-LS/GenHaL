/**
 * Public "shop this post" links — attached to a social post's caption so
 * customers who click through (no VendorHub account) can see the featured
 * products and either express interest or check out directly.
 *
 * GET  /public/post-links/:token             — vendor + product info for the link
 * POST /public/post-links/:token/interest    — capture a lead, no payment
 * POST /public/post-links/:token/checkout    — create an order + start a real payment
 *
 * Mounted before requireAuth in routes/index.ts, same as public-vendors.ts.
 * Prices are always re-read from the DB — never trusted from the client.
 */
import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
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
import { resolveStripeKey, resolvePaystackKey } from "../lib/vendor-keys";
import { createRemitaCheckout } from "./payments/remita";
import { createFlutterwaveCheckout } from "./payments/flutterwave";
import { createNombaCheckout } from "./payments/nomba";

const router: IRouter = Router();

const PAYSTACK_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES"]);
const PAYSTACK_BASE = "https://api.paystack.co";

type GatewayVendor = {
  stripeEnabled: boolean;
  paystackEnabled: boolean;
  remitaEnabled: boolean;
  flutterwaveEnabled: boolean;
  nombaEnabled: boolean;
};

type PostLinkProvider = "stripe" | "paystack" | "remita" | "flutterwave" | "nomba";

const ALL_PROVIDERS: PostLinkProvider[] = ["paystack", "stripe", "flutterwave", "nomba", "remita"];

/** Every gateway the vendor has enabled, in the order customers should see them. */
function enabledProviders(vendor: GatewayVendor): PostLinkProvider[] {
  return ALL_PROVIDERS.filter((p) => vendor[`${p}Enabled` as const]);
}

/**
 * Post-checkout redirect always goes back to the shop link itself — never a
 * client-supplied URL. Accepting an unauthenticated client's successUrl/
 * cancelUrl and forwarding it to Stripe/Paystack would be an open redirect.
 */
function shopLinkUrl(token: string): string | null {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!domain) return null;
  return `https://${domain}/p/${token}`;
}

/** Default pick when the customer didn't choose (or chose something invalid). */
function selectProvider(currency: string, vendor: GatewayVendor): PostLinkProvider | null {
  const wantsPaystack = PAYSTACK_CURRENCIES.has(currency.toUpperCase());
  if (wantsPaystack && vendor.paystackEnabled) return "paystack";
  const available = enabledProviders(vendor);
  return available[0] ?? null;
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
  res.json({
    linkMode: post.linkMode,
    vendor: {
      id: vendor.id,
      name: vendor.name,
      logoUrl: vendor.logoUrl,
      brandTheme: vendor.brandTheme,
      defaultCurrency: vendor.defaultCurrency ?? "USD",
      availableProviders: enabledProviders(vendor),
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

  const { name, email, phone, items, provider: requestedProvider } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    items?: { productId: number; quantity: number }[];
    provider?: string;
  };

  if (!name || !email || !items?.length) {
    res.status(400).json({ error: "name, email and items are required" });
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

  const [order] = await db.insert(ordersTable).values({
    vendorId: link.vendor.id,
    customerName: name,
    customerEmail: email,
    customerPhone: phone ?? null,
    status: "pending",
    paymentStatus: "unpaid",
    currency: link.vendor.defaultCurrency ?? "USD",
    totalAmount: totalAmount.toString(),
    notes: `Placed via social post link`,
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

  const currency = (link.vendor.defaultCurrency ?? "USD").toUpperCase();
  const available = enabledProviders(link.vendor);
  const provider: PostLinkProvider | null =
    requestedProvider && available.includes(requestedProvider as PostLinkProvider)
      ? (requestedProvider as PostLinkProvider)
      : selectProvider(currency, link.vendor);

  if (!provider) {
    res.status(503).json({ error: "This vendor has no payment method configured yet." });
    return;
  }

  const redirectUrl = shopLinkUrl(req.params.token);
  if (!redirectUrl) {
    res.status(503).json({ error: "Checkout is temporarily unavailable." });
    return;
  }

  try {
    if (provider === "remita") {
      const result = await createRemitaCheckout({
        orderId: order!.id,
        vendorId: link.vendor.id,
        amount: totalAmount,
        currency,
        payerName: name,
        payerEmail: email,
        payerPhone: phone,
        description: `Order #${order!.id}`,
      });
      if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
      res.json({ orderId: order!.id, provider: "remita", url: result.url });
      return;
    }

    if (provider === "flutterwave") {
      const result = await createFlutterwaveCheckout({
        orderId: order!.id,
        vendorId: link.vendor.id,
        amount: totalAmount,
        currency,
        email,
        redirectUrl,
        description: `Order #${order!.id}`,
      });
      if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
      res.json({ orderId: order!.id, provider: "flutterwave", url: result.url });
      return;
    }

    if (provider === "nomba") {
      const result = await createNombaCheckout({
        orderId: order!.id,
        vendorId: link.vendor.id,
        amount: totalAmount,
        currency,
        email,
        callbackUrl: redirectUrl,
        description: `Order #${order!.id}`,
      });
      if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
      res.json({ orderId: order!.id, provider: "nomba", url: result.url });
      return;
    }

    if (provider === "stripe") {
      const stripeKey = await resolveStripeKey(link.vendor.id, link.vendor);
      const stripe = new Stripe(stripeKey);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: email,
        line_items: orderItems.map((i) => ({
          quantity: i.quantity,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(i.unitPrice * 100),
            product_data: { name: i.productName },
          },
        })),
        success_url: redirectUrl,
        cancel_url: redirectUrl,
        metadata: { orderId: order!.id.toString(), vendorId: link.vendor.id.toString(), source: "social_post" },
      });

      await db.insert(paymentsTable).values({
        orderId: order!.id,
        vendorId: link.vendor.id,
        provider: "stripe",
        providerReference: session.id,
        amount: totalAmount.toString(),
        currency,
        status: "pending",
        metadata: { sessionId: session.id, sessionUrl: session.url, source: "social_post" },
      });

      res.json({ orderId: order!.id, provider: "stripe", url: session.url });
      return;
    }

    const paystackKey = await resolvePaystackKey(link.vendor.id, link.vendor);
    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: Math.round(totalAmount * 100),
        currency,
        callback_url: redirectUrl,
        metadata: { orderId: order!.id.toString(), vendorId: link.vendor.id.toString(), source: "social_post" },
      }),
    });
    const data = (await paystackRes.json()) as {
      status: boolean; message: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!data.status || !data.data) {
      res.status(502).json({ error: `Paystack error: ${data.message}` });
      return;
    }
    await db.insert(paymentsTable).values({
      orderId: order!.id,
      vendorId: link.vendor.id,
      provider: "paystack",
      providerReference: data.data.reference,
      amount: totalAmount.toString(),
      currency,
      status: "pending",
      metadata: { reference: data.data.reference, authorization_url: data.data.authorization_url, source: "social_post" },
    });
    res.json({ orderId: order!.id, provider: "paystack", url: data.data.authorization_url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg });
  }
});

export default router;
