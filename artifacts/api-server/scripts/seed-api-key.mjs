/**
 * One-off script: seed a test API key for the Awajimaa Spring Boot team.
 * Run with: node scripts/seed-api-key.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const name = "Awajimaa Android (Test)";

// Check if already exists
const existing = await client.query(
  "SELECT id FROM external_api_keys WHERE name = $1 LIMIT 1",
  [name]
);

if (existing.rows.length > 0) {
  console.log("⚠️  A key named '%s' already exists (id=%d). Delete it first if you want a fresh one.", name, existing.rows[0].id);
  await client.end();
  process.exit(0);
}

const rawKey = randomBytes(32).toString("hex");
const keyHash = createHash("sha256").update(rawKey).digest("hex");

const result = await client.query(
  `INSERT INTO external_api_keys (name, key_hash, source, is_active)
   VALUES ($1, $2, 'awajimaa', true)
   RETURNING id, name, source, created_at`,
  [name, keyHash]
);

const key = result.rows[0];
await client.end();

console.log("✅ API key seeded successfully!");
console.log("   id      :", key.id);
console.log("   name    :", key.name);
console.log("   source  :", key.source);
console.log("   created :", key.created_at);
console.log("");
console.log("🔑 RAW KEY (save this — it will not be shown again):");
console.log("   ", rawKey);
console.log("");
console.log("Use as: x-api-key: <rawKey> header in POST /api/external/auth/handshake");
