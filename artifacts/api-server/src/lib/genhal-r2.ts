/**
 * GenHaL — Cloudflare R2 storage helpers (S3-compatible API)
 * Uses existing R2_* env vars already configured on this project.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";

const R2_ACCOUNT_ID  = process.env.R2_ACCOUNT_ID  ?? "";
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? "";
const R2_SECRET_KEY  = process.env.R2_ACCESS_KEY_SECRET ?? process.env.S3_ACCESS_KEY_SECRET ?? "";
const R2_BUCKET      = process.env.R2_BUCKET_NAME ?? "";
const R2_PUBLIC_URL  = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

let _client: S3Client | null = null;

function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    });
  }
  return _client;
}

export function isR2Configured() {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
}

/** Generate a unique object key in the genhal/ namespace */
export function generateR2Key(folder: string, originalName: string): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()! : "bin";
  const id  = randomBytes(12).toString("hex");
  return `genhal/${folder}/${id}.${ext}`;
}

/** Presigned PUT URL — client uploads directly to R2 (max 5 GB) */
export async function createUploadUrl(
  r2Key: string,
  mimeType: string,
  expiresInSeconds = 600,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    ContentType: mimeType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

/** Presigned GET URL — for private objects (expiresIn in seconds, default 1 hr) */
export async function createDownloadUrl(
  r2Key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

/** Public CDN URL — only works if the bucket has public access enabled */
export function publicUrl(r2Key: string): string {
  if (R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${r2Key}`;
  return `https://${R2_BUCKET}.r2.dev/${r2Key}`;
}

/** Delete an object from R2 */
export async function deleteObject(r2Key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
}

/** Get object metadata (size etc.) without downloading */
export async function headObject(r2Key: string) {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
    return { exists: true, size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
  } catch {
    return { exists: false, size: 0, contentType: "" };
  }
}
