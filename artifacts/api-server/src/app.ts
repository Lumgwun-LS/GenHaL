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
const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
const hasPaystack = Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_WEBHOOK_SECRET);

if (!hasStripe && !hasPaystack) {
  const msg =
    "No payment gateway configured. " +
    "Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and/or " +
    "PAYSTACK_SECRET_KEY + PAYSTACK_WEBHOOK_SECRET.";
  if (process.env.NODE_ENV === "production") {
    // Hard crash in production — a payment platform with no gateways is broken.
    console.error(`FATAL: ${msg}`);
    process.exit(1);
  } else {
    // In development, warn loudly but keep running so the rest of the API is usable.
    console.warn(`[payments] WARNING: ${msg} Payment routes will return 503 until keys are set.`);
  }
} else {
  if (!hasStripe) {
    console.warn("[payments] Stripe not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing) — Stripe payments disabled.");
  }
  if (!hasPaystack) {
    console.warn("[payments] Paystack not configured (PAYSTACK_SECRET_KEY / PAYSTACK_WEBHOOK_SECRET missing) — Paystack payments disabled.");
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
  ["/api/payments/stripe/webhook", "/api/payments/paystack/webhook", "/api/external/payments/webhook"],
  express.raw({ type: "application/json" }),
);
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
