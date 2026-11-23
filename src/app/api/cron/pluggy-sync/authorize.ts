import { createHash, timingSafeEqual } from "crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Confere "Authorization: Bearer <CRON_SECRET>" em tempo constante. Os dois lados
 * passam por SHA-256 antes da comparação, para o tamanho do segredo não vazar.
 */
export function isAuthorizedCronRequest(header: string | null, secret: string): boolean {
  if (!secret) return false;
  return timingSafeEqual(digest(header ?? ""), digest("Bearer " + secret));
}
