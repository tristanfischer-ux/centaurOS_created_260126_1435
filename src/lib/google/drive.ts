/**
 * @file drive.ts
 *
 * @description Google Drive API wrapper for browsing, searching, and
 * getting metadata/sharing links for files. Read-only access.
 *
 * @dependencies googleapis
 *
 * @security
 * - Read-only access (drive.readonly scope)
 * - Files are referenced by link, not copied into ForgeOS storage
 *
 * @related
 * - src/lib/google/client.ts - Provides authenticated OAuth2 clients
 * - src/actions/google-drive.ts - Server actions that call these functions
 */

import { google } from 'googleapis'

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

export interface DriveFile {
    id: string
    name: string
    mimeType: string
    iconLink: string | null
    thumbnailLink: string | null
    webViewLink: string | null
    size: string | null
    modifiedTime: string | null
    owners: Array<{ displayName: string; emailAddress: string }> | null
}

export interface DriveListResult {
    files: DriveFile[]
    nextPageToken: string | null
    error?: string
}

/**
 * List files from a user's Google Drive.
 *
 * @param client - Authenticated OAuth2 client with drive.readonly scope
 * @param query - Optional search query (Google Drive query format)
 * @param folderId - Optional folder ID to list contents of
 * @param pageToken - Pagination token for subsequent pages
 * @param pageSize - Number of results per page (default 20, max 100)
 * @returns List of files with metadata
 */
export async function listDriveFiles(
    client: OAuth2Client,
    query?: string,
    folderId?: string,
    pageToken?: string,
    pageSize: number = 20
): Promise<DriveListResult> {
    const drive = google.drive({ version: 'v3', auth: client })

    // Build query
    const queryParts: string[] = ['trashed = false']

    if (folderId) {
        queryParts.push(`'${folderId}' in parents`)
    }

    if (query) {
        queryParts.push(`name contains '${query.replace(/'/g, "\\'")}'`)
    }

    try {
        const { data } = await drive.files.list({
            q: queryParts.join(' and '),
            fields: 'nextPageToken, files(id, name, mimeType, iconLink, thumbnailLink, webViewLink, size, modifiedTime, owners)',
            orderBy: 'modifiedTime desc',
            pageSize: Math.min(pageSize, 100),
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
        console.error('[GoogleDrive] Failed to list files:', {
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return {
            files: [],
            nextPageToken: null,
            error: err instanceof Error ? err.message : 'Failed to list Drive files',
        }
    }
}

/**
 * Get metadata for a specific Google Drive file.
 *
 * @param client - Authenticated OAuth2 client
 * @param fileId - Google Drive file ID
 * @returns File metadata or null if not found
 */
export async function getDriveFile(
    client: OAuth2Client,
    fileId: string
): Promise<DriveFile | null> {
    const drive = google.drive({ version: 'v3', auth: client })

    try {
        const { data } = await drive.files.get({
            fileId,
            fields: 'id, name, mimeType, iconLink, thumbnailLink, webViewLink, size, modifiedTime, owners',
        })

        return {
            id: data.id || '',
            name: data.name || 'Untitled',
            mimeType: data.mimeType || 'application/octet-stream',
            iconLink: data.iconLink || null,
            thumbnailLink: data.thumbnailLink || null,
            webViewLink: data.webViewLink || null,
            size: data.size || null,
            modifiedTime: data.modifiedTime || null,
            owners: data.owners?.map(o => ({
                displayName: o.displayName || '',
                emailAddress: o.emailAddress || '',
            })) || null,
        }
    } catch (err) {
        console.error('[GoogleDrive] Failed to get file:', {
            fileId,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
        return null
    }
}

/**
 * Format a file size from bytes to a human-readable string.
 */
export function formatFileSize(bytes: string | null): string {
    if (!bytes) return 'Unknown size'
    const num = parseInt(bytes, 10)
    if (isNaN(num)) return 'Unknown size'

    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let size = num

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * Get a user-friendly icon name based on MIME type.
 */
export function getFileTypeIcon(mimeType: string): string {
    if (mimeType.includes('folder')) return 'folder'
    if (mimeType.includes('document') || mimeType.includes('word')) return 'file-text'
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'table'
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation'
    if (mimeType.includes('image')) return 'image'
    if (mimeType.includes('video')) return 'video'
    if (mimeType.includes('audio')) return 'music'
    if (mimeType.includes('pdf')) return 'file-text'
    return 'file'
}
