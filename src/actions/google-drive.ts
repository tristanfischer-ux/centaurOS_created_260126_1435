/**
 * @file google-drive.ts
 *
 * @description Server actions for browsing Google Drive and attaching
 * files to ForgeOS tasks and messages.
 *
 * @security Requires authenticated user with Drive read-only scope
 * @audit File attachment events are logged
 *
 * @related
 * - src/lib/google/drive.ts - Google Drive API wrapper
 * - src/lib/google/client.ts - Authenticated Google client factory
 * - src/components/ui/drive-file-picker.tsx - Drive file picker UI
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getGoogleClient } from '@/lib/google/client'
import { listDriveFiles, getDriveFile } from '@/lib/google/drive'
import type { DriveFile } from '@/lib/google/drive'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

/**
 * Browse the user's Google Drive files.
 *
 * @param query - Optional search query
 * @param folderId - Optional folder ID to browse
 * @param pageToken - Pagination token
 * @returns List of Drive files
 */
export async function browseDriveFiles(
    query?: string,
    folderId?: string,
    pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken: string | null; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { files: [], nextPageToken: null, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { files: [], nextPageToken: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { files: [], nextPageToken: null, error: 'Google account not connected' }
    }

    return listDriveFiles(client, query, folderId, pageToken)
}

/**
 * Attach a Google Drive file to a task. Stores the Drive file reference
 * (ID + URL) in the task_files table without copying the actual file.
 *
 * @param taskId - The task to attach the file to
 * @param driveFileId - The Google Drive file ID
 * @returns Success status with the created file record ID
 *
 * @security Verifies user has access to the task's foundry
 * @audit Logs drive_file_attached event
 */
export async function attachDriveFileToTask(
    taskId: string,
    driveFileId: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { success: false, error: 'No active foundry' }

    // SECURITY: Verify user has access to the task
    const { data: task } = await supabase
        .from('tasks')
        .select('foundry_id')
        .eq('id', taskId)
        .single()

    if (!task || task.foundry_id !== foundryId) {
        return { success: false, error: 'Task not found or unauthorized' }
    }

    // Get file metadata from Google Drive
    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { success: false, error: 'Google account not connected' }
    }

    const driveFile = await getDriveFile(client, driveFileId)
    if (!driveFile) {
        return { success: false, error: 'Drive file not found' }
    }

    // Insert file reference into task_files
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fileRecord, error } = await (supabase as any)
        .from('task_files')
        .insert({
            task_id: taskId,
            file_name: driveFile.name,
            file_type: driveFile.mimeType,
            file_size: driveFile.size ? parseInt(driveFile.size, 10) : 0,
            file_url: driveFile.webViewLink || '',
            uploaded_by: user.id,
            source: 'google_drive',
            google_drive_file_id: driveFile.id,
            google_drive_url: driveFile.webViewLink,
        })
        .select('id')
        .single()

    if (error) {
        console.error('[GoogleDrive] Failed to attach file to task:', {
            taskId,
            driveFileId,
            error: error.message,
        })
        return { success: false, error: sanitizeErrorMessage(error) }
    }

    // AUDIT: Log file attachment
    console.info('[GoogleDrive] File attached to task:', {
        taskId,
        driveFileId,
        fileName: driveFile.name,
        userId: user.id,
    })

    return { success: true, fileId: fileRecord.id }
}

/** MIME types for Google Workspace document types */
const GOOGLE_DOC_MIME_TYPES = [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
] as const

/**
 * Browse the user's Google Drive filtered to Google Docs, Sheets, and Slides.
 *
 * @description Uses raw Google Drive query syntax to filter by MIME type,
 * since listDriveFiles wraps the query param in `name contains`. This
 * function builds the full query and calls listDriveFilesRaw instead.
 *
 * @param query - Optional search query (file name)
 * @param mimeFilter - Optional filter: 'docs' | 'sheets' | 'slides' | 'all'
 * @param pageToken - Pagination token
 * @returns List of Google Workspace documents
 */
export async function browseDriveDocuments(
    query?: string,
    mimeFilter?: 'docs' | 'sheets' | 'slides' | 'all',
    pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken: string | null; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { files: [], nextPageToken: null, error: 'Unauthorized' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { files: [], nextPageToken: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { files: [], nextPageToken: null, error: 'Google account not connected' }
    }

    // Build MIME type filter query
    let mimeQuery: string
    if (mimeFilter === 'docs') {
        mimeQuery = "mimeType = 'application/vnd.google-apps.document'"
    } else if (mimeFilter === 'sheets') {
        mimeQuery = "mimeType = 'application/vnd.google-apps.spreadsheet'"
    } else if (mimeFilter === 'slides') {
        mimeQuery = "mimeType = 'application/vnd.google-apps.presentation'"
    } else {
        mimeQuery = GOOGLE_DOC_MIME_TYPES.map(m => `mimeType = '${m}'`).join(' or ')
        mimeQuery = `(${mimeQuery})`
    }

    // Build full query: MIME filter + optional name search + not trashed
    const queryParts = ['trashed = false', mimeQuery]
    if (query) {
        queryParts.push(`name contains '${query.replace(/'/g, "\\'")}'`)
    }

    return listDriveFilesRaw(client, queryParts.join(' and '), pageToken)
}

/**
 * List Drive files using a raw Google Drive query string.
 * Unlike listDriveFiles, this does NOT wrap the query in `name contains`.
 *
 * @param client - Authenticated OAuth2 client
 * @param rawQuery - Full Google Drive query string
 * @param pageToken - Pagination token
 * @returns List of files matching the query
 */
async function listDriveFilesRaw(
    client: NonNullable<Awaited<ReturnType<typeof getGoogleClient>>>,
    rawQuery: string,
    pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken: string | null; error?: string }> {
    const { google } = await import('googleapis')
    const drive = google.drive({ version: 'v3', auth: client })

    try {
        const { data } = await drive.files.list({
            q: rawQuery,
            fields: 'nextPageToken, files(id, name, mimeType, iconLink, thumbnailLink, webViewLink, size, modifiedTime, owners)',
            orderBy: 'modifiedTime desc',
            pageSize: 20,
            pageToken: pageToken || undefined,
            spaces: 'drive',
        })

        const files: DriveFile[] = (data.files || []).map(f => ({
            id: f.id || '',
            name: f.name || 'Untitled',
            mimeType: f.mimeType || 'application/octet-stream',
            iconLink: f.iconLink || null,
            thumbnailLink: f.thumbnailLink || null,
            webViewLink: f.webViewLink || null,
            size: f.size || null,
            modifiedTime: f.modifiedTime || null,
            owners: f.owners?.map(o => ({
                displayName: o.displayName || '',
                emailAddress: o.emailAddress || '',
            })) || null,
        }))

        return {
            files,
            nextPageToken: data.nextPageToken || null,
        }
    } catch (err) {
        console.error('[GoogleDrive] Failed to list documents:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            files: [],
            nextPageToken: null,
            error: sanitizeErrorMessage(err),
        }
    }
}
