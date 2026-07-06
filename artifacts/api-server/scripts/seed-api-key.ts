/**
 * One-off script: seed a test API key for the Awajimaa Spring Boot team.
 * Run with: npx tsx scripts/seed-api-key.ts
 * Prints the raw key to stdout — save it immediately.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { externalApiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const name = "Awajimaa Android (Test)";

  // Check if a test key already exists
  const existing = await db
    .select()
    .from(externalApiKeysTable)
    .where(eq(externalApiKeysTable.name, name))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (existing) {
    console.log("⚠️  A key named '%s' already exists (id=%d). Delete it first if you want a fresh one.", name, existing.id);
    process.exit(0);
  }

  const rawKey = randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [key] = await db
    .insert(externalApiKeysTable)
    .values({ name, keyHash, source: "awajimaa", isActive: true })
    .returning();

  console.log("✅ API key seeded successfully!");
  console.log("   id      :", key.id);
  console.log("   name    :", key.name);
  console.log("   source  :", key.source);
  console.log("   created :", key.createdAt);
  console.log("");
  console.log("🔑 RAW KEY (save this — it will not be shown again):");
  console.log("   ", rawKey);
  console.log("");
  console.log("Use this key as the x-api-key header in the handshake request.");
}

main().catch((err) => { console.error(err); process.exit(1); });
