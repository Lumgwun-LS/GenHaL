/**
 * Awajimaa Unified SSO Bridge
 *
 * These routes sit between the Spring Boot IdP and Clerk-powered VendorHub,
 * bridging cross-platform authentication.
 *
 * Public endpoints (mounted BEFORE requireAuth):
 *   POST /api/sso/exchange          — accept Spring Boot SSO code → Clerk magic link
 *   POST /api/sso/check-email       — cross-platform email check (queries Clerk + Spring Boot)
 *
 * Authenticated:
 *   GET  /api/sso/issue-link        — logged-in vendor generates a link back to their Android session
 *
 * Admin:
 *   POST /api/sso/backfill-notify   — trigger unified-platform email to all Clerk users
 */

import { Router, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, platformUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

const router = Router();

const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL || "https://api.awajimaaapp.io";
const SSO_VERIFY_API_KEY = process.env.SSO_VERIFY_API_KEY || "";
const VENDOR_HUB_URL = process.env.VENDOR_HUB_URL || "https://vendor.awajimaaai.com";
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);

// ── POST /api/sso/exchange ─────────────────────────────────────────────────
// Accepts a one-time SSO code from either:
//   • Spring Boot backend  (AwaHub mobile app)
//   • Awajimaa Schools     (SCH_<b64payload>.<hmac-sig> — verified locally)
// Creates/finds a Clerk user and returns a magic-link sign-in token.
router.post("/exchange", async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string" || code.length < 10) {
    res.status(400).json({ error: "Invalid SSO code" });
    return;
  }
  if (!SSO_VERIFY_API_KEY) {
    res.status(503).json({ error: "SSO not configured on this server" });
    return;
  }

  let userInfo: { email: string; phone?: string; name?: string; userId: string; userType?: string };

  if (code.startsWith("SCH_")) {
    // ── Schools-issued HMAC-signed code — verify locally (no network round-trip) ──
    const inner   = code.slice(4);                     // strip "SCH_"
    const dotIdx  = inner.lastIndexOf(".");
    if (dotIdx === -1) {
      res.status(400).json({ error: "Malformed Schools SSO code" });
      return;
    }
    const payload = inner.slice(0, dotIdx);
    const sig     = inner.slice(dotIdx + 1);

    const { createHmac } = await import("crypto");
    const expected = createHmac("sha256", SSO_VERIFY_API_KEY).update(payload).digest("hex");
    if (expected !== sig) {
      res.status(400).json({ error: "SSO code signature invalid" });
      return;
    }

    let data: any;
    try {
      data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    } catch {
      res.status(400).json({ error: "SSO code payload malformed" });
      return;
    }

    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      res.status(400).json({ error: "SSO code has expired — please click Biz Suite AI again." });
      return;
    }
    if (!data.email) {
      res.status(400).json({ error: "SSO code missing user email" });
      return;
    }

    userInfo = {
      email:    data.email,
      name:     data.name,
      userId:   String(data.userId ?? "schools-user"),
      userType: data.userType ?? "SCHOOL_USER",
    };
    console.log("[SSO exchange] Schools HMAC code verified for:", data.email);

  } else {
    // ── Spring Boot SSO code — validate server-to-server (AwaHub mobile) ──
    try {
      const verifyResp = await fetch(`${SPRING_BOOT_URL}/api/auth/sso/verify-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SSO-API-Key": SSO_VERIFY_API_KEY,
        },
        body: JSON.stringify({ code }),
      });
      if (!verifyResp.ok) {
        const err = await verifyResp.json().catch(() => ({}));
        res.status(400).json({ error: (err as any).error || "SSO code invalid or expired" });
        return;
      }
      userInfo = await verifyResp.json();
    } catch (e: any) {
      console.error("[SSO exchange] Spring Boot verify failed:", e.message);
      res.status(502).json({ error: "Could not reach Awajimaa identity server" });
      return;
    }
  }

  const email = userInfo.email?.toLowerCase().trim();
  if (!email) {
    res.status(400).json({ error: "No email in SSO response" });
    return;
  }

  // 2. Find or create Clerk user
  let clerkUserId: string;
  try {
    const existingUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
    if (existingUsers.data.length > 0) {
      clerkUserId = existingUsers.data[0].id;
    } else {
      // Create a new Clerk user from the Spring Boot identity
      const nameParts = (userInfo.name || email.split("@")[0]).trim().split(" ");
      const newUser = await clerkClient.users.createUser({
        emailAddress: [email],
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" ") || undefined,
        phoneNumber: userInfo.phone ? [userInfo.phone] : undefined,
        skipPasswordRequirement: true,
        // Mark this user as originating from the main Awajimaa platform
        publicMetadata: {
          awajimaaUserId: userInfo.userId,
          userType: userInfo.userType || "USER",
          source: "awajimaa_sso",
        },
      });
      clerkUserId = newUser.id;

      // Upsert into platform_users
      try {
        await db.insert(platformUsersTable).values({
          clerkUserId,
          email,
          displayName: userInfo.name || email.split("@")[0],
          lastLoginAt: new Date(),
        }).onConflictDoUpdate({
          target: platformUsersTable.clerkUserId,
          set: { lastLoginAt: new Date() },
        });
      } catch {}
    }
  } catch (e: any) {
    console.error("[SSO exchange] Clerk user find/create failed:", e.message);
    res.status(500).json({ error: "Failed to provision Clerk account" });
    return;
  }

  // 3. Create a Clerk sign-in token (magic link, valid 60s)
  try {
    const tokenResp = await clerkClient.signInTokens.createSignInToken({
      userId: clerkUserId,
      expiresInSeconds: 60,
    });
    const signInUrl = `${VENDOR_HUB_URL}/sso-login?token=${tokenResp.token}&email=${encodeURIComponent(email)}`;
    res.json({ signInUrl, email });
  } catch (e: any) {
    console.error("[SSO exchange] Clerk sign-in token failed:", e.message);
    res.status(500).json({ error: "Failed to create sign-in session" });
  }
});

// ── POST /api/sso/check-email ──────────────────────────────────────────────
// Cross-platform email check: queries Clerk AND Spring Boot.
// Used by any platform's registration screen to show "already registered" messaging.
router.post("/check-email", async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const normalised = email.toLowerCase().trim();

  // Check Clerk in parallel with Spring Boot
  const [clerkResult, springBootResult] = await Promise.allSettled([
    clerkClient.users.getUserList({ emailAddress: [normalised] }).then(r => r.totalCount > 0),
    SPRING_BOOT_URL
      ? fetch(`${SPRING_BOOT_URL}/api/auth/sso/check-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalised }),
        })
          .then(r => r.ok ? r.json() : null)
          .then((d: any) => d?.exists === true)
      : Promise.resolve(false),
  ]);

  const inClerk = clerkResult.status === "fulfilled" && clerkResult.value;
  const inSpringBoot = springBootResult.status === "fulfilled" && springBootResult.value;
  const exists = inClerk || inSpringBoot;

  res.json({
    exists,
    platforms: {
      bizSuite: inClerk,
      awaHub: inSpringBoot,
    },
    message: exists
      ? "This email is already registered on the Awajimaa platform. Please sign in instead — your one account works everywhere."
      : "Email is available for registration.",
  });
});

// ── POST /api/sso/backfill-notify ──────────────────────────────────────────
// Admin-only: send unified-platform notification email to all Clerk users.
router.post("/backfill-notify", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  // Fetch all Clerk users in pages
  let allUsers: { email: string; name: string }[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await clerkClient.users.getUserList({ limit, offset });
    for (const u of page.data) {
      const email = u.emailAddresses?.[0]?.emailAddress;
      if (email) {
        allUsers.push({
          email,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || email.split("@")[0],
        });
      }
    }
    if (page.data.length < limit) break;
    offset += limit;
  }

  let sent = 0, failed = 0;
  for (const user of allUsers) {
    try {
      const html = wrapVendorEmail({
        bodyHtml: `
        <h2 style="color:#7F50FF;">🎉 Your Awajimaa account now works everywhere!</h2>
        <p>Hello ${escapeHtml(user.name)},</p>
        <p>Great news — the entire Awajimaa ecosystem is now unified. Your single account gives you access to:</p>
        <ul>
          <li>✅ <strong>AwaHub App</strong> — Emergency Response, Marketplace &amp; Community</li>
          <li>✅ <strong>Awa Biz Suite</strong> — Business Management, Payments &amp; Analytics</li>
          <li>✅ <strong>Awajimaa Schools</strong> — Learning Management Platform</li>
        </ul>
        <p>Use the same email and password across all platforms — no new account needed.</p>
        <p style="margin-top:24px;">
          <a href="${VENDOR_HUB_URL}" style="background:#7F50FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
            Open Awa Biz Suite
          </a>
        </p>
        <p style="margin-top:16px;color:#666;">Or tap <strong>"Awajimaa Biz Suite"</strong> inside the AwaHub App to sign in automatically.</p>
        `,
      });
      await sendEmail({
        to: user.email,
        subject: "🎉 Your Awajimaa account now works across all platforms!",
        html,
      });
      sent++;
      await new Promise(r => setTimeout(r, 100)); // rate-limit SMTP
    } catch {
      failed++;
    }
  }

  res.json({ total: allUsers.length, sent, failed });
});

export default router;
