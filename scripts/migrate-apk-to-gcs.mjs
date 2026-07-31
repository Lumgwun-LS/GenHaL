/**
 * One-time migration: download the current Awa Biz Suite APK from EAS
 * and re-host it in GCS, then update store_apps and store_app_versions.
 *
 * Usage: node scripts/migrate-apk-to-gcs.mjs
 */
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import pg from "pg";

const { Client } = pg;

const GCS_KEY  = process.env.GCS_SERVICE_ACCOUNT_KEY;
const BUCKET   = process.env.GCS_BUCKET_NAME ?? "awajimaa-ai";
const DATABASE = process.env.DATABASE_URL;

if (!GCS_KEY)  { console.error("GCS_SERVICE_ACCOUNT_KEY not set"); process.exit(1); }
if (!DATABASE) { console.error("DATABASE_URL not set"); process.exit(1); }

// ── current EAS APK URL ─────────────────────────────────────────────────────
const SOURCE_URL =
  "https://expo.dev/artifacts/eas/7ue3zxDbuTMmQBEtafyl6eZ0Mw_CJKpMVjMzEMMMGGA.apk";
const APP_ID = 1;   // Awa Biz Suite row in store_apps
const VERSION = "1.0.0";

async function main() {
  console.log("Downloading APK from EAS…");
  const resp = await fetch(SOURCE_URL, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log("Uploading to GCS…");
  const storage = new Storage({ credentials: JSON.parse(GCS_KEY) });
  const hash    = crypto.randomBytes(8).toString("hex");
  const fileName = `app-store/apks/${Date.now()}-${hash}.apk`;
  const file    = storage.bucket(BUCKET).file(fileName);

  await file.save(buffer, {
    metadata: { contentType: "application/vnd.android.package-archive" },
    resumable: false,
  });
  await file.makePublic();

  const gcsUrl = `https://storage.googleapis.com/${BUCKET}/${fileName}`;
  console.log("GCS URL:", gcsUrl);

  console.log("Updating database…");
  const client = new Client({ connectionString: DATABASE });
  await client.connect();

  await client.query(
    `UPDATE store_apps SET download_url = $1, updated_at = NOW() WHERE id = $2`,
    [gcsUrl, APP_ID]
  );
  await client.query(
    `UPDATE store_app_versions
        SET file_url = $1, status = 'live', activated_at = NOW(), activated_by_clerk_id = 'platform_admin'
      WHERE app_id = $2 AND version = $3`,
    [gcsUrl, APP_ID, VERSION]
  );

  const { rows } = await client.query(
    `SELECT id, name, download_url FROM store_apps WHERE id = $1`,
    [APP_ID]
  );
  console.log("DB updated:", rows[0]);
  await client.end();
  console.log("Done ✓");
}

main().catch(err => { console.error(err); process.exit(1); });
