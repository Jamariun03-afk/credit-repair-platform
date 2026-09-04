import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT || undefined,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.S3_BUCKET ?? "";

/**
 * Builds a non-guessable storage key. Never derive this from a client
 * or file name alone — clientId is namespacing, not access control;
 * access control happens at the signed-URL-issuance step (RBAC first).
 */
export function buildStorageKey(clientId: string, category: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `clients/${clientId}/${category}/${randomUUID()}-${safeName}`;
}

/**
 * Returns a short-lived signed PUT URL. The caller must have already
 * passed requireClientAccess() — this function does no auth itself.
 */
export async function getUploadUrl(storageKey: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
}

/**
 * Server-generated files (dispute letters, packages) upload directly
 * via the server — unlike client documents, these never touch the
 * browser as a raw PUT target, since we're the ones producing the bytes.
 */
export async function uploadBuffer(storageKey: string, buffer: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return storageKey;
}

/**
 * Returns a short-lived signed GET URL for viewing/downloading a
 * document. Same rule: caller must have already checked RBAC.
 */
export async function getDownloadUrl(storageKey: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: storageKey });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}
