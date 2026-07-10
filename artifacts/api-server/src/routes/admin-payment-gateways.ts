/**
 * Admin-only platform payment gateway settings.
 *
 * GET    /admin/payment-gateways                 — masked status for all providers
 * PUT    /admin/payment-gateways/:provider        — save (validates + test-pings first)
 * DELETE /admin/payment-gateways/:provider        — remove stored credentials
 * POST   /admin/payment-gateways/:provider/test   — test credentials without saving
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  GATEWAY_PROVIDERS,
  listPlatformGatewayStatus,
  savePlatformCredentials,
  removePlatformCredentials,
  testPlatformCredentials,
} from "../lib/platform-gateways";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

function requireAdmin(req: import("express").Request, res: import("express").Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!isAdmin(userId)) {
    res.status(403).json({
      error: "Admin access required to manage payment gateways.",
      hint: "Add your Clerk user ID to the ADMIN_USER_IDS environment variable.",
    });
    return null;
  }
  return userId;
}

// ─── GET /admin/payment-gateways ─────────────────────────────────────────────

router.get("/admin/payment-gateways", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const gateways = await listPlatformGatewayStatus();
  res.json({ gateways });
});

// ─── PUT /admin/payment-gateways/:provider ───────────────────────────────────

router.put("/admin/payment-gateways/:provider", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { provider } = req.params;
  if (!GATEWAY_PROVIDERS.includes(provider as (typeof GATEWAY_PROVIDERS)[number])) {
    res.status(400).json({ error: `Unknown provider '${provider}'. Must be one of: ${GATEWAY_PROVIDERS.join(", ")}` });
    return;
  }

  const { credentials } = req.body as { credentials?: Record<string, string> };
  if (!credentials || typeof credentials !== "object") {
    res.status(400).json({ error: "credentials object is required" });
    return;
  }

  try {
    const result = await savePlatformCredentials(provider, credentials);
    res.json({ ok: true, provider, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: `Credential validation failed: ${msg}` });
  }
});

// ─── DELETE /admin/payment-gateways/:provider ────────────────────────────────

router.delete("/admin/payment-gateways/:provider", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { provider } = req.params;
  if (!GATEWAY_PROVIDERS.includes(provider as (typeof GATEWAY_PROVIDERS)[number])) {
    res.status(400).json({ error: `Unknown provider '${provider}'` });
    return;
  }

  await removePlatformCredentials(provider);
  res.json({ ok: true, provider, removed: true });
});

// ─── POST /admin/payment-gateways/:provider/test ─────────────────────────────

router.post("/admin/payment-gateways/:provider/test", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { provider } = req.params;
  if (!GATEWAY_PROVIDERS.includes(provider as (typeof GATEWAY_PROVIDERS)[number])) {
    res.status(400).json({ error: `Unknown provider '${provider}'` });
    return;
  }

  const { credentials } = req.body as { credentials?: Record<string, string> };
  if (!credentials || typeof credentials !== "object") {
    res.status(400).json({ error: "credentials object is required" });
    return;
  }

  try {
    const result = await testPlatformCredentials(provider, credentials);
    res.json({ ok: true, provider, testPassed: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ ok: false, provider, testPassed: false, error: msg });
  }
});

export default router;
