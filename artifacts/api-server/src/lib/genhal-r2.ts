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
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";
import { Readable } from "stream";

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

// ── File-level AES-256-GCM encryption ────────────────────────────────────────
// Derives a 32-byte key from SESSION_SECRET so no extra env var is needed.
// Suitable for documents, images, and small-to-medium video files (< 200 MB).

function genhalEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!secret) throw new Error("SESSION_SECRET is not set — cannot encrypt vault files");
  return createHash("sha256").update(`genhal-vault-enc:${secret}`).digest();
}

/** Download an R2 object and return its full content as a Buffer. */
export async function getObjectBuffer(r2Key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key });
  const res = await client().send(cmd);
  if (!res.Body) throw new Error("Empty response from R2");
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Upload a Buffer to R2 as a new (or replacement) object. */
export async function putObjectBuffer(
  r2Key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: data,
    ContentType: contentType,
  }));
}

/**
 * Encrypt a Buffer with AES-256-GCM.
 * Returns { encrypted, ivHex } — store ivHex alongside the document record.
 */
export function encryptBuffer(plain: Buffer): { encrypted: Buffer; ivHex: string } {
  const key = genhalEncKey();
  const iv  = randomBytes(12);                                    // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag  = cipher.getAuthTag();                               // 16-byte auth tag
  // Layout: [12-byte IV][16-byte tag][ciphertext]
  return { encrypted: Buffer.concat([iv, tag, enc]), ivHex: iv.toString("hex") };
}

/**
 * Decrypt a Buffer previously encrypted by encryptBuffer().
 * Throws if the data is tampered with (auth tag mismatch).
 */
export function decryptBuffer(data: Buffer): Buffer {
  const key     = genhalEncKey();
  const iv      = data.subarray(0, 12);
  const tag     = data.subarray(12, 28);
  const cipher  = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipher), decipher.final()]);
}

/**
 * Encrypt an R2 object in-place (download → encrypt → re-upload).
 * Returns the ivHex to store on the document record.
 * Max recommended size: 200 MB (streams held in memory).
 */
export async function encryptR2Object(r2Key: string, contentType: string): Promise<string> {
  const raw = await getObjectBuffer(r2Key);
  const { encrypted, ivHex } = encryptBuffer(raw);
  await putObjectBuffer(r2Key, encrypted, contentType);
  return ivHex;
}

/**
 * Download and decrypt an R2 object, returning the plaintext Buffer.
 */
export async function decryptR2Object(r2Key: string): Promise<Buffer> {
  const enc = await getObjectBuffer(r2Key);
  return decryptBuffer(enc);
}
