import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encryptField, decryptField } from "@/lib/crypto/fieldEncryption";

const ISSUER = "Credit Repair Platform";

/**
 * Generates a new TOTP secret for a user, encrypted the same way SSNs
 * are — MFA secrets are just as sensitive as the data they protect.
 */
export function generateMfaSecret() {
  return authenticator.generateSecret();
}

export function encryptMfaSecret(secret: string) {
  return encryptField(secret);
}

export function decryptMfaSecret(encrypted: string) {
  return decryptField(encrypted);
}

export async function buildProvisioningQrCode(email: string, secret: string) {
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verifies a 6-digit code against the stored (encrypted) secret.
 * Allows a small clock-drift window (default from otplib, ~30s±1 step).
 */
export function verifyMfaCode(encryptedSecret: string, code: string): boolean {
  const secret = decryptMfaSecret(encryptedSecret);
  return authenticator.check(code, secret);
}
