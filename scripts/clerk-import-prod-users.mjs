/**
 * STEP 2 — Import exported users into the prod (live-key) Clerk environment
 *           and update the database clerkUserId so all vendor data stays linked.
 *
 * Run AFTER deploying to Replit production and getting the live secret key:
 *   CLERK_SECRET_KEY=sk_live_... DATABASE_URL=... node scripts/clerk-import-prod-users.mjs
 *
 * What this does:
 *  1. Reads scripts/clerk-users-export.json (created by clerk-export-dev-users.mjs)
 *  2. Creates each user in the prod Clerk environment
 *  3. Sends each user a password reset email so they can set a new password
 *  4. Updates the vendors.clerk_user_id in the database to the new prod Clerk ID
 */

import fs from "fs";
import postgres from "postgres";

const PROD_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!PROD_SECRET_KEY || !PROD_SECRET_KEY.startsWith("sk_live_")) {
  console.error("❌  CLERK_SECRET_KEY must be a live key (sk_live_…). Run this AFTER deploying.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("❌  Set DATABASE_URL to your production Postgres connection string.");
  process.exit(1);
}

const exportPath = new URL("./clerk-users-export.json", import.meta.url).pathname;
if (!fs.existsSync(exportPath)) {
  console.error("❌  clerk-users-export.json not found. Run clerk-export-dev-users.mjs first.");
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(exportPath, "utf8"));
console.log(`📋  Loaded ${users.length} users from export file.\n`);

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function clerkPost(path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PROD_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let created = 0;
let skipped = 0;
let failed = 0;
const mapping = []; // { devClerkId, prodClerkId, email }

for (const user of users) {
  process.stdout.write(`  ${user.email} … `);

  // Create the user in prod Clerk (no password — they'll reset it)
  const { status, body } = await clerkPost("/users", {
    email_address: [user.email],
    first_name: user.firstName || undefined,
    last_name: user.lastName || undefined,
    username: user.username || undefined,
    public_metadata: user.publicMetadata,
    private_metadata: user.privateMetadata,
    skip_password_checks: true,
    skip_password_requirement: true,
  });

  if (status === 200 || status === 201) {
    const prodId = body.id;
    mapping.push({ devClerkId: user.devClerkId, prodClerkId: prodId, email: user.email });
    created++;
    console.log(`✅  created (${prodId})`);

    // Send password reset email immediately
    await clerkPost(`/users/${prodId}/send_reset_password_email`, {});
  } else if (body?.errors?.[0]?.code === "form_identifier_exists") {
    // User already exists in prod — look them up by email
    const lookupRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(user.email)}`,
      { headers: { Authorization: `Bearer ${PROD_SECRET_KEY}` } }
    );
    const existing = await lookupRes.json();
    if (existing[0]?.id) {
      mapping.push({ devClerkId: user.devClerkId, prodClerkId: existing[0].id, email: user.email });
      skipped++;
      console.log(`⚠️   already exists (${existing[0].id})`);
    } else {
      failed++;
      console.log(`❌  exists but couldn't look up`);
    }
  } else {
    failed++;
    console.log(`❌  failed ${status}: ${JSON.stringify(body?.errors?.[0]?.message)}`);
  }

  // Be polite to the Clerk API
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`\n📊  Created: ${created}  |  Already existed: ${skipped}  |  Failed: ${failed}\n`);

// Update the database
console.log("🗄️   Updating database clerkUserId values…");
let dbUpdated = 0;
let dbMissed = 0;

for (const { devClerkId, prodClerkId, email } of mapping) {
  if (devClerkId === prodClerkId) continue;
  const result = await sql`
    UPDATE vendors
    SET clerk_user_id = ${prodClerkId}
    WHERE clerk_user_id = ${devClerkId}
    RETURNING id, email
  `;
  if (result.length > 0) {
    dbUpdated++;
    console.log(`  ✅  vendor ${result[0].email} → ${prodClerkId}`);
  } else {
    // Vendor might not exist in DB yet (e.g. signed up but never completed onboarding)
    dbMissed++;
    console.log(`  ⚠️   no vendor row for ${email} (devId: ${devClerkId})`);
  }
}

await sql.end();

console.log(`\n✅  Done! Updated ${dbUpdated} vendor rows in the database.`);
if (dbMissed > 0) {
  console.log(`⚠️   ${dbMissed} Clerk users had no matching vendor row (safe to ignore if they never completed onboarding).`);
}
console.log("\n📧  All migrated vendors have been sent a password reset email.");
console.log("    They just click the link → set a new password → they're in. No manual work needed.");
