/**
 * File upload utilities for Supabase Storage
 * 
 * Handles uploading files for messages, task attachments, and other features.
 * Organizes files by type and provides helper functions for URLs and validation.
 */

import { createClient } from '@/lib/supabase/client'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Text
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
]

export interface UploadResult {
  url: string
  fileName: string
  fileSize: number
  fileType: string
  error?: string
}

/**
 * Validate file before upload
 */
// SECURITY: Allowed file extensions — blocks executable uploads regardless of MIME type
const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',        // images
  'pdf',                                                // documents
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',       // office
  'txt', 'csv', 'md',                                  // text
  'zip',                                                // archives
])

// SECURITY: MIME-to-extension mapping for consistency validation
const MIME_EXT_MAP: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/jpg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'text/plain': ['txt', 'md', 'csv'],
  'text/csv': ['csv'],
  'application/zip': ['zip'],
  'application/x-zip-compressed': ['zip'],
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'File type not supported. Allowed: images, PDFs, documents, text, and ZIP files.'
    }
  }

  // SECURITY: Validate file extension
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: 'File extension not allowed.' }
  }

  // SECURITY: Verify extension matches MIME type to catch spoofed content types
  const expectedExts = MIME_EXT_MAP[file.type]
  if (expectedExts && !expectedExts.includes(ext)) {
    return { valid: false, error: 'File extension does not match file type.' }
  }

  return { valid: true }
}

/**
 * Upload file to Supabase Storage for messages
 */
export async function uploadMessageFile(
  file: File,
  conversationId: string,
  userId: string
): Promise<UploadResult> {
  // Validate file
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  const supabase = createClient()
  
  // Generate unique filename
  const fileExt = file.name.split('.').pop()
  const timestamp = Date.now()
  const randomStr = crypto.randomUUID().replace(/-/g, '').substring(0, 15)
  const fileName = `${timestamp}-${randomStr}.${fileExt}`
  const filePath = `messages/${conversationId}/${fileName}`
  
  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('message-files')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })
  
  if (error) {
    console.error('[FileUpload] Upload error:', error)
    throw new Error(`Failed to upload file: ${error.message}`)
  }
  
  // SECURITY: Use signed URL — message files are confidential user content
  const { data: urlData } = await supabase.storage
    .from('message-files')
    .createSignedUrl(filePath, 3600)

  return {
    url: urlData?.signedUrl ?? '',
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  }
}

/**
 * Upload file for task attachments
 */
export async function uploadTaskFile(
  file: File,
  taskId: string,
  userId: string
): Promise<UploadResult> {
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  
  const supabase = createClient()
  
  const fileExt = file.name.split('.').pop()
  const timestamp = Date.now()
  const randomStr = crypto.randomUUID().replace(/-/g, '').substring(0, 15)
  const fileName = `${timestamp}-${randomStr}.${fileExt}`
  const filePath = `tasks/${taskId}/${fileName}`
  
  const { data, error } = await supabase.storage
    .from('task-files')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })
  
  if (error) {
    console.error('[FileUpload] Task file upload error:', error)
    throw new Error(`Failed to upload file: ${error.message}`)
  }
  
  // SECURITY: Use signed URL — task files are confidential user content
  const { data: urlData } = await supabase.storage
    .from('task-files')
    .createSignedUrl(filePath, 3600)

  return {
    url: urlData?.signedUrl ?? '',
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  }
}

/**
 * Check if file is an image
 */
export function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/')
}

/**
 * Check if file is a PDF
 */
export function isPdfFile(fileType: string): boolean {
  return fileType === 'application/pdf'
}

/**
 * Get file icon based on type
 */
export function getFileIcon(fileType: string): string {
  if (isImageFile(fileType)) return '🖼️'
  if (isPdfFile(fileType)) return '📄'
  if (fileType.includes('word') || fileType.includes('document')) return '📝'
  if (fileType.includes('sheet') || fileType.includes('excel')) return '📊'
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return '📽️'
  if (fileType.includes('zip') || fileType.includes('compressed')) return '📦'
  if (fileType.startsWith('text/')) return '📃'
  return '📎'
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
