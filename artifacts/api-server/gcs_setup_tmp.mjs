/**
 * One-time setup: grant allUsers → roles/storage.objectViewer on the GCS bucket.
 * Required because the bucket has uniform bucket-level access enabled (ACLs are blocked).
 *
 * Usage: node scripts/gcs-make-public.mjs
 * Run from the artifacts/api-server directory so @google-cloud/storage resolves.
 */
import { Storage } from "@google-cloud/storage";

const GCS_KEY  = process.env.GCS_SERVICE_ACCOUNT_KEY;
const BUCKET   = process.env.GCS_BUCKET_NAME ?? "awajimaa-ai";

if (!GCS_KEY) { console.error("GCS_SERVICE_ACCOUNT_KEY not set"); process.exit(1); }

const storage = new Storage({ credentials: JSON.parse(GCS_KEY) });
const bucket  = storage.bucket(BUCKET);

console.log(`Fetching IAM policy for gs://${BUCKET}…`);
const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });

const VIEWER = "roles/storage.objectViewer";
const alreadyPublic = policy.bindings?.some(
  b => b.role === VIEWER && (b.members ?? []).includes("allUsers")
);

if (alreadyPublic) {
  console.log("✓ allUsers objectViewer already set — nothing to do.");
} else {
  policy.bindings = [
    ...(policy.bindings ?? []),
    { role: VIEWER, members: ["allUsers"] },
  ];
  await bucket.iam.setPolicy(policy);
  console.log(`✓ Granted allUsers → ${VIEWER} on gs://${BUCKET}`);
}

// Verify the already-uploaded APK is now accessible
const TEST_URL = "https://storage.googleapis.com/awajimaa-ai/app-store/apks/1785514250547-d737d6750b9e3a9d.apk";
const check = await fetch(TEST_URL, { method: "HEAD" });
console.log(`Test object HEAD → HTTP ${check.status}`);
if (check.status === 200) {
  console.log("✓ Object is publicly accessible.");
  console.log("GCS_APK_URL=" + TEST_URL);
} else {
  console.log("⚠ Object not yet accessible (may need a moment to propagate).");
}
