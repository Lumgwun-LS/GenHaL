/**
 * Cloudflare R2 storage helper — permanent APK and media hosting.
 *
 * Drop-in replacement for gcs.ts. Uses the S3-compatible R2 API via
 * @aws-sdk/client-s3.
 *
 * Required env / secrets:
 *   R2_ACCOUNT_ID      — Cloudflare account ID
 *   R2_BUCKET_NAME     — R2 bucket name
 *   S3_ACCESS_KEY_ID   — R2 API token Access Key ID
 *   S3_ACCESS_KEY_SECRET — R2 API token Secret Access Key
 *
 * Optional:
 *   R2_PUBLIC_URL      — Public base URL for the bucket, e.g.
 *                        https://pub-xxxx.r2.dev  (R2.dev subdomain)
 *                        or a custom domain like https://media.awajimaaapp.io
 *                        If not set, falls back to the R2 storage endpoint URL
 *                        (only works if the bucket has public access enabled).
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import { logger } from "./logger";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_ACCESS_KEY_SECRET;
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 not configured — set R2_ACCOUNT_ID, S3_ACCESS_KEY_ID, S3_ACCESS_KEY_SECRET",
      );
    }
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _client;
}

/** Returns true when all required R2 env vars are present. */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_BUCKET_NAME &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_ACCESS_KEY_SECRET
  );
}

/**
 * Build the permanent public URL for an R2 object key.
 * Prefers R2_PUBLIC_URL (r2.dev subdomain or custom domain) when set.
 */
function getPublicUrl(key: string): string {
  const publicBase = process.env.R2_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  // Direct storage URL — works when the bucket has public access enabled.
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET_NAME!;
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

/**
 * Upload a buffer directly to R2 and return the permanent public URL.
 * The bucket must have public access enabled (Cloudflare R2 dashboard →
 * bucket settings → Public access) or R2_PUBLIC_URL must point to a
 * custom domain / r2.dev subdomain that serves the bucket.
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  originalName: string,
  contentType = "application/vnd.android.package-archive",
  prefix = "app-store/apks",
): Promise<string> {
  const bucketName = process.env.R2_BUCKET_NAME!;
  const ext = path.extname(originalName) || ".bin";
  const key = `${prefix}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const url = getPublicUrl(key);
  logger.info({ key, url }, "[r2] Uploaded buffer");
  return url;
}

/**
 * Download a file from any URL and re-upload it to R2.
 * Used to mirror Replit object-storage URLs and expiring EAS artifact URLs
 * into permanent R2 hosting.
 *
 * @param prefix  R2 path prefix (default "app-store/apks").
 *                Use "app-store/media" for icons and screenshots.
 */
export async function mirrorUrlToR2(
  sourceUrl: string,
  originalName?: string,
  prefix = "app-store/apks",
): Promise<string> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) {
    throw new Error(`mirrorUrlToR2: fetch failed (${resp.status}) for ${sourceUrl}`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const ct =
    resp.headers.get("content-type") ?? "application/vnd.android.package-archive";
  const name =
    originalName ??
    (path.basename(new URL(sourceUrl).pathname) || "file.bin");
  return uploadBufferToR2(buffer, name, ct, prefix);
}
