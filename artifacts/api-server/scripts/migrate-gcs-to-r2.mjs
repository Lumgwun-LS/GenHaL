/**
 * One-time migration: re-uploads all GCS-hosted app assets (icons, APKs,
 * screenshots) to R2 and updates the store_apps rows in the database.
 *
 * Run from the api-server directory:
 *   node scripts/migrate-gcs-to-r2.mjs
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import crypto from "crypto";
import path from "path";

const { Pool } = pg;

// ── R2 client ────────────────────────────────────────────────────────────────
const accountId = process.env.R2_ACCOUNT_ID;
const bucketName = process.env.R2_BUCKET_NAME;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_ACCESS_KEY_SECRET;
const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

if (!accountId || !bucketName || !accessKeyId || !secretAccessKey || !publicBase) {
  console.error("Missing R2 env vars: R2_ACCOUNT_ID, R2_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_ACCESS_KEY_SECRET, R2_PUBLIC_URL");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────
async function mirrorToR2(gcsUrl, prefix) {
  console.log(`  Downloading: ${gcsUrl}`);
  const resp = await fetch(gcsUrl);
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status}) for ${gcsUrl}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const ct = resp.headers.get("content-type") ?? "application/octet-stream";
  const originalName = path.basename(new URL(gcsUrl).pathname);
  const ext = path.extname(originalName) || ".bin";
  const key = `${prefix}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: ct,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  const newUrl = `${publicBase}/${key}`;
  console.log(`  → Uploaded:   ${newUrl}`);
  return newUrl;
}

function isGcs(url) {
  return typeof url === "string" && url.includes("storage.googleapis.com");
}

// ── Main ─────────────────────────────────────────────────────────────────────
const { rows } = await pool.query(
  `SELECT id, name, icon_url, download_url, screenshots
   FROM store_apps
   WHERE icon_url LIKE '%googleapis%'
      OR download_url LIKE '%googleapis%'
      OR screenshots::text LIKE '%googleapis%'`
);

console.log(`Found ${rows.length} app(s) with GCS assets.\n`);

for (const app of rows) {
  console.log(`\n[App ${app.id}] ${app.name}`);

  let newIcon = app.icon_url;
  let newDownload = app.download_url;
  let newScreenshots = app.screenshots ?? [];

  if (isGcs(app.icon_url)) {
    newIcon = await mirrorToR2(app.icon_url, "app-store/media");
  }

  if (isGcs(app.download_url)) {
    newDownload = await mirrorToR2(app.download_url, "app-store/downloads");
  }

  const migratedScreenshots = [];
  for (const s of newScreenshots) {
    if (isGcs(s)) {
      migratedScreenshots.push(await mirrorToR2(s, "app-store/screenshots"));
    } else {
      migratedScreenshots.push(s);
    }
  }

  await pool.query(
    `UPDATE store_apps
     SET icon_url = $1, download_url = $2, screenshots = $3
     WHERE id = $4`,
    [newIcon, newDownload, JSON.stringify(migratedScreenshots), app.id]
  );
  console.log(`  ✓ DB updated for app ${app.id}`);
}

await pool.end();
console.log("\nMigration complete.");
