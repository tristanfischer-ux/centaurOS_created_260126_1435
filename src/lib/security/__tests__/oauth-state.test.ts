import {
  buildOAuthStatePayload,
  createSignedOAuthState,
  verifySignedOAuthState,
} from '@/lib/security/oauth-state'

describe('oauth-state signing', () => {
  it('creates and verifies a signed OAuth state token', () => {
    const secret = 'super-secret-signing-key-12345'
    const payload = buildOAuthStatePayload({
      userId: 'user-123',
      foundryId: 'foundry-456',
    })

    const token = createSignedOAuthState(payload, secret)
    const verified = verifySignedOAuthState(token, secret, 10 * 60 * 1000)

    expect(verified).not.toBeNull()
    expect(verified?.userId).toBe('user-123')
    expect(verified?.foundryId).toBe('foundry-456')
    expect(verified?.nonce).toBe(payload.nonce)
  })

  it('rejects tampered tokens', () => {
    const secret = 'super-secret-signing-key-12345'
    const payload = buildOAuthStatePayload({
      userId: 'user-123',
      foundryId: 'foundry-456',
    })
    const token = createSignedOAuthState(payload, secret)
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    expect(verifySignedOAuthState(tampered, secret, 10 * 60 * 1000)).toBeNull()
  })

  it('rejects expired tokens', () => {
    const secret = 'super-secret-signing-key-12345'
    const token = createSignedOAuthState(
      {
        userId: 'user-123',
        foundryId: 'foundry-456',
        nonce: 'nonce-1',
        issuedAt: Date.now() - 20 * 60 * 1000,
      },
      secret
    )

    expect(verifySignedOAuthState(token, secret, 10 * 60 * 1000)).toBeNull()
  })
})
