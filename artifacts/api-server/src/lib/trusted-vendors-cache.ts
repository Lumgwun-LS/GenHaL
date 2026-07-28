/**
 * In-memory cache for the landing-page "Trusted by" section.
 *
 * Strategy
 * ────────
 * • Zero DB hits for visitors. The cache is initialised on server startup and
 *   refreshed every 30 minutes as a silent failsafe.
 * • When a vendor completes onboarding, addVendorToCache() pushes them straight
 *   into the live display pool — no DB round-trip, no delay.
 * • 10 seed vendors are baked in as the initial state so the section looks alive
 *   from day one. Seeds are displaced as real logo-bearing vendors fill the pool.
 * • Every CachedVendor carries `addedAt` (epoch ms). The frontend uses it to
 *   detect new arrivals between polls and trigger "just joined" animations.
 */

import { db, vendorsTable } from "@workspace/db";
import { eq, and, isNotNull, ne, count, sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CachedVendor = {
  id: number;
  name: string;
  logoUrl: string | null;
  industry: string | null;
  website: string | null;
  /** Epoch ms when this entry was added to the cache. 0 = seed (never triggers "just joined"). */
  addedAt: number;
};

// ── Seed vendors ──────────────────────────────────────────────────────────────

function buildSeed(
  id: number, name: string, industry: string,
  letters: string, bg: string,
): CachedVendor {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">`
    + `<rect width="40" height="40" rx="10" fill="${bg}"/>`
    + `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" `
    + `fill="white" font-family="system-ui,sans-serif" font-size="13" font-weight="800">${letters}</text>`
    + `</svg>`;
  const logoUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return { id, name, industry, website: null, logoUrl, addedAt: 0 };
}

const SEEDS: CachedVendor[] = [
  buildSeed(-1,  "Lagos Bites Co.",    "Food & Beverage",   "LB", "#E53E3E"),
  buildSeed(-2,  "Kente Wearhouse",    "Fashion & Apparel", "KW", "#D69E2E"),
  buildSeed(-3,  "Nairobi Pixels",     "Technology",        "NP", "#3182CE"),
  buildSeed(-4,  "Cape Town Crafts",   "Handmade Goods",    "CC", "#38A169"),
  buildSeed(-5,  "Accra Organics",     "Health & Wellness", "AO", "#805AD5"),
  buildSeed(-6,  "Abuja Interiors",    "Home Decor",        "AI", "#DD6B20"),
  buildSeed(-7,  "Kigali Media Lab",   "Media & Creative",  "KM", "#2C7A7B"),
  buildSeed(-8,  "Dakar Threads",      "Fashion & Apparel", "DT", "#B83280"),
  buildSeed(-9,  "Kampala Bakers",     "Food & Beverage",   "KB", "#C05621"),
  buildSeed(-10, "Addis Style House",  "Fashion & Apparel", "AS", "#276749"),
];

// ── In-memory state ───────────────────────────────────────────────────────────

const MAX_DISPLAY = 40;

/**
 * The live display pool shown in the marquee.
 * Starts as all 10 seeds; real logo-bearing vendors are mixed in on refresh/signup.
 */
let displayPool: CachedVendor[] = [...SEEDS];

/** Count of ALL active vendors on the platform (shown in the "X+ businesses" badge). */
let totalActiveCount = 0;

let lastRefreshedAt = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current cache snapshot — zero DB hits.
 */
export function getCache(): { totalCount: number; vendors: CachedVendor[]; lastRefreshedAt: number } {
  return {
    totalCount: Math.max(totalActiveCount, displayPool.length),
    vendors:    displayPool,
    lastRefreshedAt,
  };
}

/**
 * Called immediately after a vendor completes onboarding.
 * Always increments totalActiveCount; also adds them to the display pool if they
 * have a logo (rare at signup, but handled for completeness).
 */
export function addVendorToCache(vendor: {
  id: number;
  name: string;
  logoUrl?: string | null;
  industry?: string | null;
  website?: string | null;
}): void {
  totalActiveCount += 1;
  if (!vendor.logoUrl?.trim()) return;

  const entry: CachedVendor = {
    id:       vendor.id,
    name:     vendor.name,
    logoUrl:  vendor.logoUrl!,
    industry: vendor.industry ?? null,
    website:  vendor.website ?? null,
    addedAt:  Date.now(), // ← frontend detects values > lastFetchTime as "just joined"
  };

  // Prepend so the newest vendor appears first; displace a seed if any remain
  const withoutOldEntry = displayPool.filter(v => v.id !== entry.id);
  const seedIdx = withoutOldEntry.findIndex(v => v.id < 0);
  if (seedIdx !== -1) {
    withoutOldEntry.splice(seedIdx, 1); // remove one seed to make room
  }
  displayPool = [entry, ...withoutOldEntry].slice(0, MAX_DISPLAY);
}

/**
 * Called once on server startup, then every 30 min as a failsafe.
 * Failures are swallowed — the server must not crash because of this.
 */
export async function initTrustedVendorsCache(): Promise<void> {
  await refreshFromDB();
  setInterval(() => { void refreshFromDB(); }, 30 * 60 * 1000);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function refreshFromDB(): Promise<void> {
  try {
    const now = Date.now();

    const [countResult, rows] = await Promise.all([
      db.select({ total: count() })
        .from(vendorsTable)
        .where(eq(vendorsTable.status, "active")),

      db.select({
        id:       vendorsTable.id,
        name:     vendorsTable.name,
        logoUrl:  vendorsTable.logoUrl,
        industry: vendorsTable.industry,
        website:  vendorsTable.website,
      })
      .from(vendorsTable)
      .where(and(
        eq(vendorsTable.status, "active"),
        isNotNull(vendorsTable.logoUrl),
        ne(vendorsTable.logoUrl, ""),
      ))
      .orderBy(sql`RANDOM()`)
      .limit(MAX_DISPLAY),
    ]);

    totalActiveCount = countResult[0]?.total ?? 0;

    const realVendors: CachedVendor[] = rows
      .filter(v => (v.logoUrl ?? "").trim() !== "")
      .map(v => ({ ...v, addedAt: now - 1 })); // addedAt slightly before now so they don't trigger "just joined"

    // Build display pool: real vendors first, then seeds to fill remaining slots
    const seedsNeeded = Math.max(0, MAX_DISPLAY - realVendors.length);
    displayPool = [...realVendors, ...SEEDS.slice(0, seedsNeeded)].slice(0, MAX_DISPLAY);
    lastRefreshedAt = now;
  } catch (err) {
    console.error("[trusted-vendors-cache] Refresh failed:", err);
    // On failure, displayPool keeps its previous value (seeds on first run)
  }
}
