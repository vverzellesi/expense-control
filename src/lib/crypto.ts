import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getEncryptionKey(): Buffer {
  const key = process.env.PDF_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "PDF_ENCRYPTION_KEY environment variable is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `PDF_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${key.length} hex characters.`
    );
  }
  return buf;
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { encrypted, iv: iv.toString("hex") };
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
