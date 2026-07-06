import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Returns the 32-byte AES-256 key from the env or throws clearly. */
function getKey(): Buffer {
  const hex = process.env.PAYMENT_CREDS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "PAYMENT_CREDS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns "<ivHex>:<authTagHex>:<ciphertextHex>".
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a value previously produced by encrypt().
 * Throws if the ciphertext is tampered with (authTag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encHex] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Returns a masked representation of an encrypted key for safe display:
 * "sk_live_...Xk4j" — only the last 4 chars of the plaintext are shown.
 * Returns null if no key is stored.
 */
export function maskEncryptedKey(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    const plain = decrypt(encrypted);
    return `...${plain.slice(-4)}`;
  } catch {
    return "***";
  }
}
