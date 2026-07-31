/**
 * One-off script: trigger an Android APK build for the Awajimaa App Store
 * Run from repo root: node artifacts/api-server/scripts/trigger-appstore-build.mjs
 */
import pg from "pg";

const { Pool } = pg;

const GH_API        = "https://api.github.com";
const WORKFLOW_FILE = "build-apk.yml";

const VENDOR_ID   = 12;                         // admin auto-created vendor
const APP_NAME    = "Awajimaa App Store";
const PACKAGE     = "com.awajimaa.appstore";
const WEBSITE_URL = "https://awajimaaappstore.com";
const ICON_URL    = "https://storage.googleapis.com/awajimaa-ai/app-store/media/1785515457355-42242ba7fd595346.jpg";
const STORE_APP_ID = 2;

// ─── env checks ──────────────────────────────────────────────────────────────
const GH_TOKEN  = process.env.GITHUB_ACTIONS_TOKEN;
const GH_OWNER  = process.env.GITHUB_ANDROID_REPO_OWNER;
const GH_REPO   = process.env.GITHUB_ANDROID_REPO_NAME;
const CB_SECRET = process.env.MOBILE_APP_CALLBACK_SECRET;
const DEV_DOMAIN= process.env.REPLIT_DEV_DOMAIN;
const DB_URL    = process.env.DATABASE_URL;

for (const [k, v] of Object.entries({ GITHUB_ACTIONS_TOKEN: GH_TOKEN, GITHUB_ANDROID_REPO_OWNER: GH_OWNER, GITHUB_ANDROID_REPO_NAME: GH_REPO, MOBILE_APP_CALLBACK_SECRET: CB_SECRET, DATABASE_URL: DB_URL })) {
  if (!v) { console.error(`❌  Missing env var: ${k}`); process.exit(1); }
}

const pool = new Pool({ connectionString: DB_URL });

// ─── 1. Insert build record ──────────────────────────────────────────────────
console.log("1️⃣  Inserting vendor_mobile_apps record…");
const { rows } = await pool.query(
  `INSERT INTO vendor_mobile_apps (vendor_id, source, website_url, app_name, package_name, icon_url, store_app_id, status, created_at, updated_at)
   VALUES ($1, 'website', $2, $3, $4, $5, $6, 'queued', NOW(), NOW())
   RETURNING id`,
  [VENDOR_ID, WEBSITE_URL, APP_NAME, PACKAGE, ICON_URL, STORE_APP_ID],
);
const recordId = rows[0].id;
console.log(`   Record created: id=${recordId}`);

// ─── 2. Dispatch GitHub Actions workflow ─────────────────────────────────────
const callbackUrl = `https://${DEV_DOMAIN}/api`;
const base = `${GH_API}/repos/${GH_OWNER}/${GH_REPO}`;
const headers = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

console.log(`2️⃣  Dispatching ${WORKFLOW_FILE} on ${GH_OWNER}/${GH_REPO}…`);
const dispatchRes = await fetch(`${base}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    ref: "main",
    inputs: {
      record_id:       String(recordId),
      app_name:        APP_NAME,
      package_name:    PACKAGE,
      website_url:     WEBSITE_URL,
      icon_url:        ICON_URL,
      callback_url:    callbackUrl,
      callback_secret: CB_SECRET,
    },
  }),
});

if (!dispatchRes.ok) {
  const body = await dispatchRes.text().catch(() => "");
  console.error(`❌  GitHub dispatch failed (${dispatchRes.status}): ${body.slice(0, 400)}`);
  await pool.query(`UPDATE vendor_mobile_apps SET status='failed', updated_at=NOW() WHERE id=$1`, [recordId]);
  process.exit(1);
}
console.log("   Workflow dispatched (204 OK) — waiting 6 s for run to register…");

// ─── 3. Fetch the new run ID ─────────────────────────────────────────────────
await new Promise(r => setTimeout(r, 6000));

const runsRes = await fetch(
  `${base}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=3&event=workflow_dispatch`,
  { headers },
);
const runsData = await runsRes.json();
const run = runsData.workflow_runs?.[0];
const runId = String(run?.id ?? "pending");
const runUrl = run?.html_url ?? "(unknown)";

console.log(`   Run ID: ${runId}`);
console.log(`   Run URL: ${runUrl}`);

// ─── 4. Persist run ID, mark building ────────────────────────────────────────
await pool.query(
  `UPDATE vendor_mobile_apps SET eas_build_id=$1, status='building', updated_at=NOW() WHERE id=$2`,
  [runId, recordId],
);
console.log(`3️⃣  Record updated → status=building, eas_build_id=${runId}`);

await pool.end();
console.log(`\n✅  Build triggered! Monitor at:\n   ${runUrl}\n   Build typically takes 15-20 min.`);
