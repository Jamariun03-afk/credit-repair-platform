import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM

function getKey(): Buffer {
  const keyB64 = process.env.FIELD_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set — cannot encrypt/decrypt sensitive fields. " +
      "Generate one with `openssl rand -base64 32` and set it before storing any SSN."
    );
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/**
 * Encrypts a sensitive string field (SSN, etc.) for storage. Output
 * format: base64(iv):base64(authTag):base64(ciphertext) — self-contained,
 * no separate IV storage needed.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decrypts a field encrypted with encryptField(). Throws on tampering
 * (auth tag mismatch) rather than returning corrupted data — a failed
 * decrypt should be treated as a security event, not silently ignored.
 */
export function decryptField(stored: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted field — cannot decrypt.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Masks a decrypted SSN for display — "***-**-1234". This is what
 * should render in any UI; the full value should only ever be decrypted
 * inside the one server action that has a specific, audited reason to
 * see it (see requireSsnAccess in lib/auth/rbac.ts).
 */
export function maskSsn(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}
