const MESSAGE_FILES_PATH_PATTERN = /^messages\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[a-zA-Z0-9._-]+$/i

export type SupportedMessageBucket = 'message-files' | 'message-attachments'

export interface NormalizedMessageFileRef {
  bucket: SupportedMessageBucket
  objectPath: string
  conversationIdFromPath?: string
}

/**
 * Normalizes a message attachment reference into a canonical storage identity.
 *
 * @description Accepts either a storage path (`messages/{conversationId}/{file}`)
 * or a Supabase storage URL and returns normalized bucket + object path details.
 *
 * @param {string} fileRef - File reference as stored on a message record.
 * @returns {NormalizedMessageFileRef | null} Normalized reference when supported; otherwise null.
 *
 * @security Restricts accepted buckets to message-files and message-attachments.
 */
export function normalizeMessageFileReference(
  fileRef: string
): NormalizedMessageFileRef | null {
  const trimmedRef = fileRef.trim()
  if (!trimmedRef) {
    return null
  }

  const messageFilesMatch = MESSAGE_FILES_PATH_PATTERN.exec(trimmedRef)
  if (messageFilesMatch) {
    return {
      bucket: 'message-files',
      objectPath: trimmedRef,
      conversationIdFromPath: messageFilesMatch[1],
    }
  }

  try {
    const parsed = new URL(trimmedRef)
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    const objectSegmentIndex = pathSegments.findIndex(
      (segment, index) =>
        segment === 'object'
        && (pathSegments[index + 1] === 'public' || pathSegments[index + 1] === 'sign')
    )

    if (objectSegmentIndex < 0 || pathSegments.length <= objectSegmentIndex + 3) {
      return null
    }

    const bucket = pathSegments[objectSegmentIndex + 2]
    const objectPath = decodeURIComponent(pathSegments.slice(objectSegmentIndex + 3).join('/'))

    if ((bucket === 'message-files' || bucket === 'message-attachments') && objectPath) {
      const match = MESSAGE_FILES_PATH_PATTERN.exec(objectPath)
      return {
        bucket,
        objectPath,
        conversationIdFromPath: match?.[1],
      }
    }
  } catch {
    return null
  }

  return null
}

/**
 * Converts a normalized message file reference into a canonical identity key.
 *
 * @description Used for strict equality checks between requested and stored
 * attachment references, preventing path substitution attacks.
 *
 * @param {NormalizedMessageFileRef} reference - Normalized reference object.
 * @returns {string} Canonical `bucket/path` identity.
 *
 * @security Canonical comparison prevents mixed URL/path bypass scenarios.
 */
export function toMessageFileIdentity(reference: NormalizedMessageFileRef): string {
  return `${reference.bucket}/${reference.objectPath}`
}
