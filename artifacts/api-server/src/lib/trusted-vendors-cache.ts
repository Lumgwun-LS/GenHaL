/**
 * In-memory cache for the landing-page "Trusted by" section.
 *
 * Strategy
 * ────────
 * • Zero DB hits for visitors. The cache is initialised on server startup and
 *   refreshed every 30 minutes as a failsafe.
 * • When a vendor completes onboarding, addVendorToCache() pushes them straight
 *   into the live cache — no DB round-trip, no delay.
 * • Until enough real vendors exist, 10 seed vendors backfill the display pool so
 *   the section always looks alive from day one. Seeds are silently replaced as
 *   real logo-bearing vendors grow the pool beyond 10.
 * • Every CachedVendor carries `addedAt` (epoch ms). The frontend uses it to
 *   detect new arrivals between polls and play a "just joined" animation.
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
  /** Epoch ms when this entry was added. 0 = seed vendor (never triggers "just joined"). */
  addedAt: number;
};

// ── Seed vendors ──────────────────────────────────────────────────────────────

/** Generate an SVG data-URI avatar used as a placeholder logo for seed vendors. */
function svgLogo(letters: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="${bg}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="system-ui,sans-serif" font-size="13" font-weight="800">${letters}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SEED_VENDORS: CachedVendor[] = [
  { id: -1,  name: "Lagos Bites Co.",     industry: "Food & Beverage",   website: null, logoUrl: svgLogo("LB", "#E53E3E"), addedAt: 0 },
  { id: -2,  name: "Kente Wearhouse",     industry: "Fashion & Apparel", website: null, logoUrl: svgLogo("KW", "#D69E2E"), addedAt: 0 },
  { id: -3,  name: "Nairobi Pixels",      industry: "Technology",        website: null, logoUrl: svgLogo("NP", "#3182CE"), addedAt: 0 },
  { id: -4,  name: "Cape Town Crafts",    industry: "Handmade Goods",    website: null, logoUrl: svgLogo("CC", "#38A169"), addedAt: 0 },
  { id: -5,  name: "Accra Organics",      industry: "Health & Wellness", website: null, logoUrl: svgLogo("AO", "#805AD5"), addedAt: 0 },
  { id: -6,  name: "Abuja Interiors",     industry: "Home Decor",        website: null, logoUrl: svgLogo("AI", "#DD6B20"), addedAt: 0 },
  { id: -7,  name: "Kigali Media Lab",    industry: "Media & Creative",  website: null, logoUrl: svgLogo("KM", "#2C7A7B"), addedAt: 0 },
  { id: -8,  name: "Dakar Threads",       industry: "Fashion & Apparel", website: null, logoUrl: svgLogo("DT", "#B83280"), addedAt: 0 },
  { id: -9,  name: "Kampala Bakers",      industry: "Food & Beverage",   website: null, logoUrl: svgLogo("KB", "#C05621"), addedAt: 0 },
  { id: -10, name: "Addis Style House",   industry: "Fashion & Apparel", website: null, logoUrl: svgLogo("AS", "#276749"), addedAt: 0 },
];

// ── In-memory state ───────────────────────────────────────────────────────────

const MAX_DISPLAY = 40;

/** Real vendors fetched from DB or pushed in via addVendorToCache(). */
let realVendors: CachedVendor[] = [];
/** Total count of ALL active vendors on the platform (badge number). */
let totalActiveCount = 0;
let lastRefreshedAt = 0;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current cache snapshot — zero DB hits.
 * Pads with seeds when fewer than 10 real logo-vendors exist.
 */
export function getCache(): { totalCount: number; vendors: CachedVendor[]; lastRefreshedAt: number } {
  const seedsNeeded = Math.max(0, Math.min(SEED_VENDORS.length, MAX_DISPLAY - realVendors.length));
  const vendors = [...realVendors, ...SEED_VENDORS.slice(0, seedsNeeded)].slice(0, MAX_DISPLAY);
  return {
    totalCount: Math.max(totalActiveCount, vendors.length),
    vendors,
    lastRefreshedAt,
  };
}

/**
 * Called immediately after a vendor completes onboarding.
 * Always increments totalActiveCount; also adds them to the display pool
 * if they have a logo (typically not at signup time, but kept for completeness).
 */
export function addVendorToCache(vendor: {
  id: number;
  name: string;
  logoUrl?: string | null;
  industry?: string | null;
  website?: string | null;
}): void {
  totalActiveCount = Math.max(0, totalActiveCount) + 1;
  if (!vendor.logoUrl?.trim()) return;

  const entry: CachedVendor = {
    id: vendor.id,
    name: vendor.name,
    logoUrl: vendor.logoUrl!,
    industry: vendor.industry ?? null,
    website: vendor.website ?? null,
    addedAt: Date.now(), // ← frontend uses this to detect "just joined"
  };

  // Prepend so newest appears first; cap at MAX_DISPLAY
  realVendors = [entry, ...realVendors].slice(0, MAX_DISPLAY);
}

/**
 * Called once on server startup, then every 30 min.
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
      db
        .select({ total: count() })
        .from(vendorsTable)
        .where(eq(vendorsTable.status, "active")),

      db
        .select({
          id:       vendorsTable.id,
          name:     vendorsTable.name,
          logoUrl:  vendorsTable.logoUrl,
          industry: vendorsTable.industry,
          website:  vendorsTable.website,
        })
        .from(vendorsTable)
        .where(
          and(
            eq(vendorsTable.status, "active"),
            isNotNull(vendorsTable.logoUrl),
            ne(vendorsTable.logoUrl, ""),
          ),
        )
        .orderBy(sql`RANDOM()`)
        .limit(MAX_DISPLAY),
    ]);

    totalActiveCount = countResult[0]?.total ?? 0;
    // Mark all DB-fetched vendors with addedAt = (now - 1ms) so that
    // any vendor added *after* the refresh via addVendorToCache() correctly
    // has a higher addedAt and will trigger "just joined" on the frontend.
    realVendors = rows
      .filter((v) => v.logoUrl?.trim())
      .map((v) => ({ ...v, addedAt: now - 1 }));

    lastRefreshedAt = now;
  } catch (err) {
    console.error("[trusted-vendors-cache] Refresh failed:", err);
  }
}
