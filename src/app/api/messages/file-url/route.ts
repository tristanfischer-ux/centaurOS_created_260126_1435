import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import {
  normalizeMessageFileReference,
  toMessageFileIdentity,
} from '@/lib/security/message-file-reference'

const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface FileUrlRequestBody {
  fileRef?: string
  conversationId?: string
  messageId?: string
}

/**
 * Creates a short-lived signed URL for a message attachment.
 *
 * @description Validates the caller is authenticated and a participant in the
 * referenced conversation before issuing a signed URL for the object path.
 * Supports both current message-files paths and legacy message-attachments URLs.
 *
 * @param {NextRequest} request - The incoming API request.
 * @returns {Promise<NextResponse>} Signed URL response or authorization/validation error.
 *
 * @security Requires conversation participant membership, message ownership validation,
 * and strict storage path normalization before issuing signed URLs.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    // AUTH: Require authenticated user.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Rate limit signed URL generation to reduce abuse.
    const ip = getClientIP(request.headers)
    const rateLimitResult = await rateLimit(
      'api',
      `message-file-url:${user.id}:${ip}`,
      { limit: 120, window: 60 * 1000 }
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429 }
      )
    }

    const body = (await request.json()) as FileUrlRequestBody
    const fileRef = body.fileRef?.trim()
    const conversationId = body.conversationId?.trim()
    const messageId = body.messageId?.trim()

    if (!fileRef || !conversationId || !messageId) {
      return NextResponse.json({ error: 'Missing file reference context' }, { status: 400 })
    }

    if (!CONVERSATION_ID_PATTERN.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversationId' }, { status: 400 })
    }

    if (!CONVERSATION_ID_PATTERN.test(messageId)) {
      return NextResponse.json({ error: 'Invalid messageId' }, { status: 400 })
    }

    const normalizedRequestedRef = normalizeMessageFileReference(fileRef)
    if (!normalizedRequestedRef) {
      return NextResponse.json({ error: 'Unsupported file reference' }, { status: 400 })
    }

    // VALIDATION: For message-files paths, the path conversation must match request context.
    if (
      normalizedRequestedRef.conversationIdFromPath
      && normalizedRequestedRef.conversationIdFromPath !== conversationId
    ) {
      return NextResponse.json({ error: 'Mismatched conversation path' }, { status: 400 })
    }

    // AUTH: Ensure requester is a participant in the conversation.
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
      .single()

    if (participantError || !participant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // AUTH: Ensure requested file reference belongs to the specific conversation message.
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('file_url')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .single()

    if (messageError || !message?.file_url) {
      return NextResponse.json({ error: 'Message attachment not found' }, { status: 404 })
    }

    const normalizedStoredRef = normalizeMessageFileReference(message.file_url)
    if (!normalizedStoredRef) {
      return NextResponse.json({ error: 'Stored file reference is invalid' }, { status: 400 })
    }

    if (toMessageFileIdentity(normalizedStoredRef) !== toMessageFileIdentity(normalizedRequestedRef)) {
      return NextResponse.json({ error: 'Attachment reference mismatch' }, { status: 403 })
    }

    // SECURITY: Generate short-lived signed URL.
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(normalizedStoredRef.bucket)
      .createSignedUrl(normalizedStoredRef.objectPath, 60 * 60)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[MessageFileURL] Failed to create signed URL:', {
        userId: user.id,
        conversationId,
        messageId,
        bucket: normalizedStoredRef.bucket,
        filePath: normalizedStoredRef.objectPath,
        error: signedUrlError?.message || 'No signed URL returned',
      })
      return NextResponse.json({ error: 'Failed to create file URL' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrlData.signedUrl })
  } catch (error) {
    console.error('[MessageFileURL] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
