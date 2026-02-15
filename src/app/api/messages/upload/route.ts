import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

// Maximum file size: 10MB (smaller than RFQ uploads)
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Allowed file extensions and MIME types for message attachments
const ALLOWED_EXTENSIONS = [
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
  'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'zip',
]

// SECURITY: MIME type allowlist
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]

/**
 * POST /api/messages/upload
 * 
 * @description Uploads a file for message attachment and returns the file URL.
 * 
 * @security
 * - Requires authentication
 * - Rate limited: 10 uploads per minute per user
 * - File size limit: 10MB
 * - MIME type validation
 * - Foundry isolation: files stored in foundry-specific bucket path
 * 
 * @returns {Object} { url: string, filename: string, size: number }
 * 
 * @throws {401} If not authenticated
 * @throws {400} If foundry not found, file missing, or validation fails
 * @throws {413} If file exceeds size limit
 * @throws {429} If rate limit exceeded
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // AUTH: Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // SECURITY: Rate limit uploads
    const ip = getClientIP(request.headers)
    const rateLimitResult = await rateLimit(
      'upload',
      `message-upload:${user.id}:${ip}`,
      { limit: 10, window: 60 * 1000 }
    )
    
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many upload requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const conversationId = formData.get('conversationId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Missing conversationId' },
        { status: 400 }
      )
    }

    // VALIDATION: Ensure conversation ID is a UUID.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(conversationId)) {
      return NextResponse.json(
        { error: 'Invalid conversationId' },
        { status: 400 }
      )
    }

    // AUTH: Ensure user belongs to the conversation before allowing upload.
    const { data: participant, error: participantError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('profile_id', user.id)
      .single()

    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'Access denied for this conversation' },
        { status: 403 }
      )
    }

    // VALIDATION: Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 413 }
      )
    }

    // VALIDATION: Check file extension
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // VALIDATION: Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. File type: ${file.type}` },
        { status: 400 }
      )
    }

    // SECURITY: Use crypto for secure random generation
    const timestamp = Date.now()
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').substring(0, 13)
    // SECURITY: Remove special characters from filename
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}-${randomSuffix}-${safeName}`

    // Upload to Supabase Storage with conversation-level isolation
    // Path format aligns with storage policies: messages/{conversation_id}/{filename}
    const filePath = `messages/${conversationId}/${fileName}`
    
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('message-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[MessageUpload] Storage upload failed:', {
        error: uploadError.message,
        conversationId,
        fileName,
      })
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // SECURITY: Return a short-lived signed URL for immediate preview.
    const { data: signedData } = await supabase.storage
      .from('message-files')
      .createSignedUrl(uploadData.path, 60 * 60)

    console.info('[MessageUpload] File uploaded successfully:', {
      userId: user.id,
      conversationId,
      fileName: file.name,
      size: file.size,
      path: filePath,
    })

    return NextResponse.json({
      path: filePath,
      url: signedData?.signedUrl || null,
      filename: file.name,
      size: file.size,
    })

  } catch (error) {
    console.error('[MessageUpload] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
