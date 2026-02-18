import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

/**
 * Payload for signed OAuth state values.
 */
export interface OAuthStatePayload {
  /** Authenticated user ID that initiated OAuth */
  userId: string
  /** Foundry context associated with OAuth flow */
  foundryId: string
  /** Unique nonce to reduce replay risk */
  nonce: string
  /** Millisecond timestamp when state was issued */
  issuedAt: number
  /** Scopes we requested (so callback can save them if Google omits scope in token response) */
  requestedScopes?: string[]
}

/**
 * Creates a signed OAuth state token for callback verification.
 *
 * @description Builds a tamper-evident state token with HMAC-SHA256 signature.
 * Used to prevent OAuth state manipulation between connect and callback steps.
 *
 * @param {OAuthStatePayload} payload - OAuth state payload to encode and sign
 * @param {string} secret - Server-side signing secret
 * @returns {string} Encoded and signed state token
 *
 * @throws {Error} If payload or secret is invalid
 *
 * @security Uses HMAC signature and timing-safe verification counterpart
 */
export function createSignedOAuthState(payload: OAuthStatePayload, secret: string): string {
  // VALIDATION: Ensure required signing secret is present
  if (!secret || secret.length < 16) {
    throw new Error('OAuth state signing secret is missing or too short')
  }

  // VALIDATION: Require non-empty payload fields
  if (!payload.userId || !payload.foundryId || !payload.nonce) {
    throw new Error('OAuth state payload is missing required fields')
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

/**
 * Verifies and decodes a signed OAuth state token.
 *
 * @description Validates state token signature and timestamp freshness. Returns
 * null when the token is tampered, expired, malformed, or structurally invalid.
 *
 * @param {string} token - Signed OAuth state token from callback query params
 * @param {string} secret - Server-side signing secret
 * @param {number} maxAgeMs - Maximum age allowed for issued state token
 * @returns {OAuthStatePayload | null} Decoded payload when valid, else null
 *
 * @security Uses timing-safe signature comparison to prevent oracle leaks
 */
export function verifySignedOAuthState(
  token: string,
  secret: string,
  maxAgeMs: number
): OAuthStatePayload | null {
  if (!token || !secret || maxAgeMs <= 0) {
    return null
  }

  const [encodedPayload, providedSignature] = token.split('.')
  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')
  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  // SECURITY: Avoid non-constant-time string comparisons for HMAC signatures.
  if (providedBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as Partial<OAuthStatePayload>
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.foundryId !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) {
      return null
    }

    const now = Date.now()
    if (parsed.issuedAt > now + 60_000) {
      return null
    }
    if (now - parsed.issuedAt > maxAgeMs) {
      return null
    }

    const requestedScopes =
      Array.isArray(parsed.requestedScopes) && parsed.requestedScopes.every((s): s is string => typeof s === 'string')
        ? parsed.requestedScopes
        : undefined

    return {
      userId: parsed.userId,
      foundryId: parsed.foundryId,
      nonce: parsed.nonce,
      issuedAt: parsed.issuedAt,
      ...(requestedScopes && requestedScopes.length > 0 ? { requestedScopes } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Creates a fresh OAuth state payload with secure nonce.
 *
 * @description Helper to consistently generate OAuth state payloads with
 * current timestamp and cryptographically-strong nonce.
 *
 * @param {Object} params - Core state parameters
 * @param {string} params.userId - Authenticated user ID
 * @param {string} params.foundryId - Foundry context ID
 * @param {string[]} [params.requestedScopes] - Scopes we requested (used in callback if Google omits scope)
 * @returns {OAuthStatePayload} Freshly generated OAuth state payload
 */
export function buildOAuthStatePayload(params: {
  userId: string
  foundryId: string
  requestedScopes?: string[]
}): OAuthStatePayload {
  return {
    userId: params.userId,
    foundryId: params.foundryId,
    nonce: randomUUID(),
    issuedAt: Date.now(),
    ...(params.requestedScopes?.length ? { requestedScopes: params.requestedScopes } : {}),
  }
}
