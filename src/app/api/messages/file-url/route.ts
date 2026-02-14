import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

const FILE_PATH_PATTERN = /^messages\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[a-zA-Z0-9._-]+$/i

/**
 * Creates a short-lived signed URL for a message attachment.
 *
 * @description Validates the caller is authenticated and a participant in the
 * referenced conversation before issuing a signed URL for the object path.
 *
 * @param {NextRequest} request - The incoming API request.
 * @returns {Promise<NextResponse>} Signed URL response or authorization/validation error.
 *
 * @security Requires conversation participant membership and strict path validation.
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

    const body = (await request.json()) as { path?: string }
    const filePath = body.path?.trim()

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 })
    }

    // VALIDATION: Strictly require messages/{conversationId}/{filename} format.
    const match = FILE_PATH_PATTERN.exec(filePath)
    if (!match) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    const conversationId = match[1]

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

    // SECURITY: Generate short-lived signed URL.
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('message-files')
      .createSignedUrl(filePath, 60 * 60)

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[MessageFileURL] Failed to create signed URL:', {
        userId: user.id,
        conversationId,
        filePath,
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
