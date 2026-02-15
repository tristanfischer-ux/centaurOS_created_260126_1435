import { createAdminClient } from '@/lib/supabase/admin'
import { logSecurityEvent } from '@/lib/security/audit-log'

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

describe('logSecurityEvent persistence', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('persists sanitized events to security_audit_log RPC', async () => {
    const rpcMock = jest.fn().mockResolvedValue({ error: null })
    ;(createAdminClient as jest.Mock).mockReturnValue({ rpc: rpcMock })

    await logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      userId: 'user-123',
      email: 'user@example.com',
      ipAddress: '192.0.2.1',
      success: true,
      details: { note: 'ok' },
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'insert_security_audit_log',
      expect.objectContaining({
        p_event_type: 'LOGIN_SUCCESS',
        p_user_id: 'user-123',
        p_email: '[EMAIL_REDACTED]',
        p_ip_address: '192.0.2.1',
        p_success: true,
        p_severity: 'LOW',
      })
    )
  })

  it('does not throw when persistence fails', async () => {
    const rpcMock = jest.fn().mockResolvedValue({
      error: { message: 'db unavailable' },
    })
    ;(createAdminClient as jest.Mock).mockReturnValue({ rpc: rpcMock })

    await expect(
      logSecurityEvent({
        type: 'ADMIN_ACTION',
        userId: 'admin-1',
        success: true,
      })
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SECURITY] Failed to persist audit log event:',
      expect.objectContaining({
        type: 'ADMIN_ACTION',
        severity: 'HIGH',
      })
    )
  })
})
