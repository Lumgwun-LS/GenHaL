import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

// ─── Credential encryption startup guard ─────────────────────────────────────
if (!process.env.PAYMENT_CREDS_ENCRYPTION_KEY || process.env.PAYMENT_CREDS_ENCRYPTION_KEY.length !== 64) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: PAYMENT_CREDS_ENCRYPTION_KEY must be a 64-char hex string. Per-vendor payment keys cannot be used.");
    process.exit(1);
  } else {
    console.warn("[vendor-keys] WARNING: PAYMENT_CREDS_ENCRYPTION_KEY not set. Per-vendor payment credential routes will throw at runtime.");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Payment gateway startup guard ───────────────────────────────────────────
// Gateway credentials can now be configured two ways: env secrets (legacy) or
// an admin-managed platform key stored in the database via Admin → Payment
// Gateways. Since DB-configured keys can be added *after* deploy without a
// redeploy, missing env keys at startup is no longer fatal in any
// environment — the app stays up, and payment-dependent routes return a
// clear 503 until at least one gateway is configured.
const hasStripeEnv = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
const hasPaystackEnv = Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_WEBHOOK_SECRET);

if (!hasStripeEnv && !hasPaystackEnv) {
  console.warn(
    "[payments] WARNING: No payment gateway env secrets configured. " +
      "Payment routes will return 503 until an admin configures a gateway " +
      "in Admin \u2192 Payment Gateways, or STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET " +
      "and/or PAYSTACK_SECRET_KEY/PAYSTACK_WEBHOOK_SECRET are set.",
  );
} else {
  if (!hasStripeEnv) {
    console.warn("[payments] Stripe env secrets not set (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET) — falling back to admin-configured key if present.");
  }
  if (!hasPaystackEnv) {
    console.warn("[payments] Paystack env secrets not set (PAYSTACK_SECRET_KEY / PAYSTACK_WEBHOOK_SECRET) — falling back to admin-configured key if present.");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must come before express.json()
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl)
      if (!origin) return callback(null, true);
      // In development allow all origins for easier local testing
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      // In production, check against explicit allowlist
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);

// ─── Webhook routes need raw body for signature verification ─────────────────
// These must be mounted BEFORE express.json() so the raw Buffer is preserved.
app.use(
  [
    "/api/payments/stripe/webhook",
    "/api/payments/paystack/webhook",
    "/api/payments/flutterwave/webhook",
    "/api/payments/nomba/webhook",
    "/api/external/payments/webhook",
  ],
  express.raw({ type: "application/json" }),
);
// ─────────────────────────────────────────────────────────────────────────────

// Raised from Express's 100kb default: AI-generated images/videos are stored
// as base64 data: URIs in request bodies (e.g. post creation with a
// generated image/video attached, /ai/render-video responses), which are
// comfortably multiple megabytes before base64 overhead.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// ─── Global error handler ────────────────────────────────────────────────────
// Clerk's middleware can throw synchronously (e.g. a malformed/garbage
// Authorization header) instead of resolving to an unauthenticated request.
// Without this handler, Express's default handler turns that into an opaque
// 500 with a stack trace instead of a clean 401. Any other unexpected error
// is logged and returned as a generic 500 (never leaking internals to callers).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, path: req.path }, "request error");

  // Malformed JSON bodies and malformed bearer tokens (e.g. Clerk failing to
  // base64-decode a garbage Authorization header) both surface as
  // SyntaxErrors — treat them as a bad request rather than an opaque 500.
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Malformed request" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
