/**
 * STEP 1 — Export all users from the dev (test-key) Clerk environment.
 *
 * Run BEFORE deploying to production:
 *   CLERK_SECRET_KEY=sk_test_... node scripts/clerk-export-dev-users.mjs
 *
 * Output: scripts/clerk-users-export.json
 */

import fs from "fs";

const SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("❌  Set CLERK_SECRET_KEY before running this script.");
  process.exit(1);
}

async function fetchAllUsers() {
  const users = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}&order_by=-created_at`,
      { headers: { Authorization: `Bearer ${SECRET_KEY}` } }
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`❌  Clerk API error ${res.status}: ${body}`);
      process.exit(1);
    }
    const batch = await res.json();
    if (!batch.length) break;
    users.push(...batch);
    console.log(`  fetched ${users.length} users so far…`);
    if (batch.length < limit) break;
    offset += limit;
  }
  return users;
}

const raw = await fetchAllUsers();

// Normalise to just what we need for the import
const exported = raw.map((u) => ({
  devClerkId: u.id,
  email: u.email_addresses?.[0]?.email_address ?? null,
  firstName: u.first_name ?? "",
  lastName: u.last_name ?? "",
  username: u.username ?? null,
  phone: u.phone_numbers?.[0]?.phone_number ?? null,
  imageUrl: u.image_url ?? null,
  createdAt: u.created_at,
  publicMetadata: u.public_metadata ?? {},
  privateMetadata: u.private_metadata ?? {},
})).filter((u) => u.email); // skip users without an email address

const outPath = new URL("./clerk-users-export.json", import.meta.url).pathname;
fs.writeFileSync(outPath, JSON.stringify(exported, null, 2));

console.log(`\n✅  Exported ${exported.length} users → ${outPath}`);
console.log("    Run clerk-import-prod-users.mjs after you deploy to Replit production.");
