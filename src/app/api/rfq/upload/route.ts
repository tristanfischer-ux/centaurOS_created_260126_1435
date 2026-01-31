import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// Maximum file size: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024

// Allowed file extensions and MIME types
const ALLOWED_EXTENSIONS = [
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp',
  'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'zip',
  'stl', 'step', 'stp', 'iges', 'igs', 'dxf', 'dwg',
]

// SECURITY: MIME type allowlist for additional validation
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/octet-stream', // Allow for CAD files that don't have standard MIME types
  'model/stl', 'application/sla', // STL files
]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get foundry ID
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return NextResponse.json(
        { error: 'User not in a foundry' },
        { status: 400 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds 25MB limit' },
        { status: 400 }
      )
    }

    // Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      )
    }

    // SECURITY: Also validate MIME type to prevent extension spoofing
    const mimeType = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      )
    }

    // SECURITY: Validate foundryId and userId are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(foundryId) || !uuidRegex.test(user.id)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Generate unique file path
    // Format: rfq/{foundry_id}/{user_id}/{timestamp}_{filename}
    const timestamp = Date.now()
    // SECURITY: More thorough sanitization to prevent path traversal
    const sanitizedName = file.name
      .replace(/\.\./g, '') // Remove path traversal
      .replace(/[\/\\]/g, '') // Remove path separators
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Allow only safe characters
      .substring(0, 200) // Limit length
    const filePath = `rfq/${foundryId}/${user.id}/${timestamp}_${sanitizedName}`

    // Upload to Supabase Storage
    // Using 'task-files' bucket which already exists and has proper RLS
    const { error: uploadError } = await supabase.storage
      .from('task-files')
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('File upload error:', uploadError)
      return NextResponse.json(
        { error: uploadError.message || 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Return the file path (not the full URL for security)
    return NextResponse.json({
      success: true,
      id: `${timestamp}-${Math.random().toString(36).slice(2)}`,
      path: filePath,
      name: file.name,
      size: file.size,
    })

  } catch (error) {
    console.error('RFQ upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Delete an uploaded file (for removing before RFQ is submitted)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json(
        { error: 'No file path provided' },
        { status: 400 }
      )
    }

    // SECURITY: Get foundry ID for path validation
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return NextResponse.json(
        { error: 'User not in a foundry' },
        { status: 400 }
      )
    }

    // SECURITY: Strict path validation to prevent path traversal
    // Expected format: rfq/{foundryId}/{userId}/{timestamp}_{filename}
    const expectedPrefix = `rfq/${foundryId}/${user.id}/`
    
    // Check for path traversal attempts
    if (path.includes('..') || path.includes('//') || !path.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this file' },
        { status: 403 }
      )
    }

    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from('task-files')
      .remove([path])

    if (deleteError) {
      console.error('File delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete file' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('RFQ delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
