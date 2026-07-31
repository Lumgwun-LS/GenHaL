/**
 * Google Cloud Storage helper — permanent APK hosting.
 *
 * Reads GCS_SERVICE_ACCOUNT_KEY (JSON string) and GCS_BUCKET_NAME from env.
 * Falls back gracefully when not configured.
 *
 * The bucket MUST have its IAM policy grant allUsers roles/storage.objectViewer
 * (uniform bucket-level access mode).  Run scripts/gcs-make-public.mjs once
 * after provisioning the bucket, or do it in the GCP Console:
 *   Storage → awajimaa-ai → Permissions → Grant → allUsers / Storage Object Viewer
 */
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import path from "path";

let _storage: Storage | null = null;

function getStorage(): Storage {
  if (!_storage) {
    const keyJson = process.env.GCS_SERVICE_ACCOUNT_KEY;
    if (!keyJson) throw new Error("GCS_SERVICE_ACCOUNT_KEY is not set");
    _storage = new Storage({ credentials: JSON.parse(keyJson) });
  }
  return _storage;
}

export function isGcsConfigured(): boolean {
  return !!(process.env.GCS_SERVICE_ACCOUNT_KEY && process.env.GCS_BUCKET_NAME);
}

/**
 * Grant allUsers → roles/storage.objectViewer on the bucket so every uploaded
 * object is publicly readable without per-file ACL calls.
 * Call once during setup (idempotent — safe to call again).
 */
export async function ensureBucketPublicRead(): Promise<void> {
  const bucketName = process.env.GCS_BUCKET_NAME!;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
  const VIEWER = "roles/storage.objectViewer";
  const already = policy.bindings?.some(
    (b: any) => b.role === VIEWER && (b.members ?? []).includes("allUsers")
  );
  if (already) return; // idempotent
  policy.bindings = [
    ...(policy.bindings ?? []),
    { role: VIEWER, members: ["allUsers"] },
  ];
  await bucket.iam.setPolicy(policy);
}

/**
 * Upload a buffer directly to GCS and return the permanent public URL.
 * Requires the bucket to have allUsers → objectViewer (see ensureBucketPublicRead).
 * Does NOT call makePublic() — incompatible with uniform bucket-level access.
 */
export async function uploadBufferToGcs(
  buffer: Buffer,
  originalName: string,
  contentType = "application/vnd.android.package-archive",
  prefix = "app-store/apks"
): Promise<string> {
  const bucketName = process.env.GCS_BUCKET_NAME!;
  const storage = getStorage();
  const ext = path.extname(originalName) || ".apk";
  const hash = crypto.randomBytes(8).toString("hex");
  const fileName = `${prefix}/${Date.now()}-${hash}${ext}`;

  const file = storage.bucket(bucketName).file(fileName);
  await file.save(buffer, {
    metadata: {
      contentType,
      // Immutable + long cache: safe because every upload gets a new unique URL.
      // Browsers and CDNs cache the file forever without re-validating.
      cacheControl: "public, max-age=31536000, immutable",
    },
    resumable: false,
  });

  // Public URL works once allUsers objectViewer IAM is set at bucket level
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

/**
 * Download a file from any URL and re-upload it to GCS.
 * Used to mirror Replit object-storage URLs and expiring EAS artifact URLs
 * into permanent GCS hosting.
 *
 * @param prefix  GCS path prefix (default "app-store/apks").
 *                Use "app-store/media" for icons and screenshots.
 */
export async function mirrorUrlToGcs(
  sourceUrl: string,
  originalName?: string,
  prefix = "app-store/apks"
): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) {
    throw new Error(`mirrorUrlToGcs: fetch failed (${resp.status}) for ${sourceUrl}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const ct =
    resp.headers.get("content-type") ??
    "application/vnd.android.package-archive";
  const name =
    originalName ??
    (path.basename(new URL(sourceUrl).pathname) || "app.apk");
  return uploadBufferToGcs(buffer, name, ct, prefix);
}
