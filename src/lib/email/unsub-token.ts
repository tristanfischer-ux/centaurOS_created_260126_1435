/**
 * @file unsub-token.ts — HMAC-signed tokens for one-click email unsubscribe.
 *
 * @description Unsubscribe links go out in marketing emails and must work
 * without requiring the recipient to log in. The token encodes user id + the
 * scope of the action (all channels, a specific channel, or pause) and is
 * signed with an HMAC so it cannot be forged.
 *
 * @security
 * - HMAC-SHA256 with a server-side secret
 * - 30-day expiry
 * - Timing-safe comparison on verify
 * - Token payload is url-safe base64 (no padding, no slashes)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { EmailChannel } from './preferences'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function getSecret(): string {
  // Use a dedicated secret if available, otherwise derive one from SUPABASE_SERVICE_ROLE_KEY
  // so we never ship without a real secret. The SRK is already required to exist
  // for the admin client, so this is a safe fallback.
  const dedicated = process.env.UNSUB_TOKEN_SECRET
  if (dedicated && dedicated.length >= 32) return dedicated

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fallback && fallback.length >= 32) {
    // Namespaced derivation so a leaked unsub token can't be used as an SRK
    return `unsub:${fallback}`
  }

  throw new Error(
    'No UNSUB_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY available for signing unsubscribe tokens',
  )
}

export type UnsubAction =
  | { kind: 'all' }
  | { kind: 'channel'; channel: EmailChannel }
  | { kind: 'pause'; days: number }

interface TokenPayload {
  userId: string
  action: UnsubAction
  issuedAt: number
  expiresAt: number
}

function base64UrlEncode(buf: Buffer | string): string {
  const s = typeof buf === 'string' ? Buffer.from(buf) : buf
  return s.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function sign(payload: string): string {
  const secret = getSecret()
  return base64UrlEncode(createHmac('sha256', secret).update(payload).digest())
}

/**
 * Create a signed unsubscribe token.
 */
export function createUnsubToken(
  userId: string,
  action: UnsubAction,
): string {
  const now = Date.now()
  const payload: TokenPayload = {
    userId,
    action,
    issuedAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
  }
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(payloadEncoded)
  return `${payloadEncoded}.${signature}`
}

/**
 * Verify a signed unsubscribe token.
 *
 * @returns decoded payload if valid; null if malformed, expired, or forged
 */
export function verifyUnsubToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadEncoded, providedSignature] = parts
  if (!payloadEncoded || !providedSignature) return null

  // Timing-safe signature check
  const expectedSignature = sign(payloadEncoded)
  if (providedSignature.length !== expectedSignature.length) return null
  try {
    const ok = timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature),
    )
    if (!ok) return null
  } catch {
    return null
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded).toString('utf8'))
  } catch {
    return null
  }

  if (
    typeof payload.userId !== 'string' ||
    typeof payload.issuedAt !== 'number' ||
    typeof payload.expiresAt !== 'number' ||
    !payload.action ||
    typeof payload.action !== 'object'
  ) {
    return null
  }

  if (payload.expiresAt < Date.now()) return null

  return payload
}
