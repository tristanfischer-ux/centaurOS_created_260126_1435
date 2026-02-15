import {
  normalizeMessageFileReference,
  toMessageFileIdentity,
} from '@/lib/security/message-file-reference'

describe('message file reference normalization', () => {
  const conversationId = '11111111-2222-3333-4444-555555555555'

  it('normalizes direct message-files paths', () => {
    const normalized = normalizeMessageFileReference(`messages/${conversationId}/spec.pdf`)

    expect(normalized).toEqual({
      bucket: 'message-files',
      objectPath: `messages/${conversationId}/spec.pdf`,
      conversationIdFromPath: conversationId,
    })
  })

  it('normalizes legacy public message-attachments URLs', () => {
    const normalized = normalizeMessageFileReference(
      'https://example.supabase.co/storage/v1/object/public/message-attachments/foundry-1/messages/legacy.pdf'
    )

    expect(normalized).toEqual({
      bucket: 'message-attachments',
      objectPath: 'foundry-1/messages/legacy.pdf',
      conversationIdFromPath: undefined,
    })
  })

  it('normalizes signed URLs and decodes object paths', () => {
    const normalized = normalizeMessageFileReference(
      `https://example.supabase.co/storage/v1/object/sign/message-files/messages%2F${conversationId}%2Fdesign.png?token=abc123`
    )

    expect(normalized).toEqual({
      bucket: 'message-files',
      objectPath: `messages/${conversationId}/design.png`,
      conversationIdFromPath: conversationId,
    })
  })

  it('rejects unsupported storage buckets', () => {
    const normalized = normalizeMessageFileReference(
      `https://example.supabase.co/storage/v1/object/public/public-docs/messages/${conversationId}/doc.pdf`
    )

    expect(normalized).toBeNull()
  })

  it('creates canonical identity keys', () => {
    const normalized = normalizeMessageFileReference(`messages/${conversationId}/report.csv`)
    expect(normalized).not.toBeNull()

    expect(toMessageFileIdentity(normalized!)).toBe(
      `message-files/messages/${conversationId}/report.csv`
    )
  })
})
