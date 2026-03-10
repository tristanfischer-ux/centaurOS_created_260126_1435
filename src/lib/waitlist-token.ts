import { createHmac, timingSafeEqual } from "crypto";

// SECURITY: Fail closed — no hardcoded fallback
const WAITLIST_SECRET = process.env.WAITLIST_SECRET;

/**
 * Create a signed token for one-click approve/reject links in admin email.
 * Payload: { id, action, exp }. Verified in API route.
 */
export function createWaitlistActionToken(
  entryId: string,
  action: "approve" | "reject"
): string {
  if (!WAITLIST_SECRET) throw new Error("WAITLIST_SECRET not configured");
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
  const payload = JSON.stringify({ id: entryId, action, exp });
  const payloadB64 = Buffer.from(payload, "utf-8").toString("base64url");
  const sig = createHmac("sha256", WAITLIST_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Verify and decode a waitlist action token. Returns payload or null if invalid.
 */
export function verifyWaitlistActionToken(
  token: string
): { id: string; action: "approve" | "reject" } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!WAITLIST_SECRET) return null; // Fail closed when not configured
  const expectedSig = createHmac("sha256", WAITLIST_SECRET).update(payloadB64).digest("base64url");
  // SECURITY: Timing-safe comparison to prevent signature oracle attacks
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.id || (payload.action !== "approve" && payload.action !== "reject")) return null;
    return { id: payload.id, action: payload.action };
  } catch {
    return null;
  }
}
