/**
 * One-time migration: upload local app icon files to GCS and print SQL UPDATE statements.
 *
 * Run from the workspace root:
 *   cd artifacts/api-server && node scripts/migrate-icons-to-gcs.mjs
 *
 * Env vars required: GCS_SERVICE_ACCOUNT_KEY, GCS_BUCKET_NAME
 */

import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import path from "path";
import fs from "fs";

const BUCKET = process.env.GCS_BUCKET_NAME ?? "awajimaa-ai";
const KEY_JSON = process.env.GCS_SERVICE_ACCOUNT_KEY;

if (!KEY_JSON) { console.error("❌  GCS_SERVICE_ACCOUNT_KEY not set"); process.exit(1); }

const storage = new Storage({ credentials: JSON.parse(KEY_JSON) });

async function uploadFileToGcs(localPath, prefix = "app-store/media") {
  const ext = path.extname(localPath) || ".png";
  const ct  = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const hash = crypto.randomBytes(8).toString("hex");
  const fileName = `${prefix}/${Date.now()}-${hash}${ext}`;
  const buffer = fs.readFileSync(localPath);
  const file = storage.bucket(BUCKET).file(fileName);
  await file.save(buffer, { metadata: { contentType: ct }, resumable: false });
  return `https://storage.googleapis.com/${BUCKET}/${fileName}`;
}

// Resolve paths relative to workspace root
const ROOT = path.resolve(process.cwd(), "../..");

const APPS = [
  {
    appId: 1,
    name: "Awa Biz Suite",
    iconLocalPath: path.join(ROOT, "artifacts/vendorhub-mobile/assets/images/icon.png"),
  },
  {
    appId: 2,
    name: "Awajimaa App Store",
    iconLocalPath: path.join(ROOT, "artifacts/app-store/public/logo-color.jpg"),
  },
];

for (const app of APPS) {
  if (!fs.existsSync(app.iconLocalPath)) {
    console.error(`❌  Icon not found: ${app.iconLocalPath}`);
    continue;
  }
  console.log(`\n📦 ${app.name} (id=${app.appId})`);
  console.log(`  Uploading ${path.basename(app.iconLocalPath)}…`);
  const gcsUrl = await uploadFileToGcs(app.iconLocalPath);
  console.log(`  ✅ GCS URL: ${gcsUrl}`);
  console.log(`\nSQL:`);
  console.log(`UPDATE store_apps SET icon_url = '${gcsUrl}', updated_at = NOW() WHERE id = ${app.appId};`);
}
console.log("\nDone.");
