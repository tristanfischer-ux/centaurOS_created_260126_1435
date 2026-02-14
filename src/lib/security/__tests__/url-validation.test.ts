import { isValidSlackWebhookUrl } from '@/lib/security/url-validation'

describe('isValidSlackWebhookUrl', () => {
  it('accepts valid Slack webhook URLs', () => {
    expect(isValidSlackWebhookUrl('https://hooks.slack.com/services/T12345/B67890/abcDEF123')).toBe(true)
    expect(isValidSlackWebhookUrl('https://hooks.slack-gov.com/services/T12345/B67890/abcDEF123')).toBe(true)
  })

  it('rejects non-HTTPS or non-Slack domains', () => {
    expect(isValidSlackWebhookUrl('http://hooks.slack.com/services/T123/B456/abc')).toBe(false)
    expect(isValidSlackWebhookUrl('https://example.com/services/T123/B456/abc')).toBe(false)
    expect(isValidSlackWebhookUrl('https://hooks.slack.com.evil.example/services/T123/B456/abc')).toBe(false)
  })

  it('rejects malformed paths or credentialed URLs', () => {
    expect(isValidSlackWebhookUrl('https://hooks.slack.com/api/T123/B456/abc')).toBe(false)
    expect(isValidSlackWebhookUrl('https://user:pass@hooks.slack.com/services/T123/B456/abc')).toBe(false)
    expect(isValidSlackWebhookUrl('')).toBe(false)
    expect(isValidSlackWebhookUrl(null)).toBe(false)
    expect(isValidSlackWebhookUrl(undefined)).toBe(false)
  })
})
