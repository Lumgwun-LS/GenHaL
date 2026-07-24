/**
 * Stores server-generated media bytes (AI images/videos) in object storage
 * and returns a stable, publicly reachable URL — instead of the base64
 * `data:` URI those generators used to return directly.
 *
 * This matters because Instagram's Content Publishing API only accepts a
 * publicly reachable media URL for its container step (no direct byte
 * upload, unlike Facebook's Page photo endpoint) — a `data:` URI can never
 * satisfy that, no matter how it's plumbed through downstream code.
 */
import { ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

/** Same domain-resolution pattern used by voice-caller.ts / public-post-links.ts. */
function publicMediaBaseUrl(): string | null {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}/api/media` : null;
}

export interface StoredMedia {
  publicUrl: string;
  objectPath: string;
}

/**
 * Uploads a buffer to the private object dir (via a presigned PUT, the same
 * mechanism the client upload flow uses) and returns a public URL served by
 * `routes/media.ts`. Throws if no public domain is configured — publishing
 * this media to Instagram (or any other server-to-server fetch) would be
 * impossible without one anyway, so failing loudly here is correct.
 */
export async function storeGeneratedMedia(buffer: Buffer, contentType: string): Promise<StoredMedia> {
  const base = publicMediaBaseUrl();
  if (!base) {
    throw new Error(
      "No public domain configured (PUBLIC_APP_DOMAIN/REPLIT_DEV_DOMAIN) — generated media can't be given a public URL.",
    );
  }

  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer as unknown as BodyInit,
  });
  if (!putRes.ok) {
    throw new Error(`Failed to store generated media (object storage returned ${putRes.status})`);
  }

  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
  // Marks the object as public in its ACL metadata — it's AI-generated marketing
  // content the vendor intends to publish to public social platforms anyway, and
  // routes/media.ts serves it unconditionally regardless, but this keeps the
  // stored ACL policy (and its cache-control headers) honest about that.
  await objectStorageService.trySetObjectEntityAclPolicy(objectPath, { owner: "system:ai-generated", visibility: "public" });

  const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
  return { publicUrl: `${base}/${objectId}`, objectPath };
}

/**
 * Extracts the object-storage id from a `.../api/media/<objectId>` public URL
 * (the shape `storeGeneratedMedia` returns above). Used by the media-cleanup
 * job to turn a stored generation's result URL back into a deletable object
 * path — shares the same regex `routes/ai.ts`'s upload-fetch path uses, kept
 * here since this is where the URL shape is defined.
 */
export function extractMediaObjectId(url: string): string | null {
  const match = url.match(/\/api\/media\/([^/?]+)/);
  return match ? match[1] : null;
}
