/**
 * DriveTab -- Full-page Google Drive file browser.
 *
 * @description Provides folder navigation, search, grid/list toggle,
 * and the ability to open files in Google. Uses stale-while-revalidate
 * caching so navigating back to a folder shows cached results instantly.
 *
 * @component
 */

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { GoogleErrorDisplay } from '../google-error-boundary'
import {
    Search,
    Grid3X3,
    List,
    FolderOpen,
    ChevronRight,
    ExternalLink,
    FileText,
    Table,
    Presentation,
    Image as ImageIcon,
    Video,
    Music,
    File,
    Folder,
    ArrowLeft,
} from 'lucide-react'
import { browseDriveFiles } from '@/actions/google-drive'
import { cn } from '@/lib/utils'

/** Type matching the DriveFile shape from server actions */
interface DriveFile {
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

/**
 * Format a file size from bytes to a human-readable string.
 * Client-safe copy of the utility in src/lib/google/drive.ts.
 */
function formatFileSize(bytes: string | null): string {
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

interface DriveTabProps {
    isEnabled: boolean
}

interface FolderBreadcrumb {
    id: string | null
    name: string
}

/** In-memory cache for folder contents */
const folderCache = new Map<string, { files: DriveFile[]; timestamp: number }>()
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Returns a Lucide icon component based on MIME type.
 */
function getFileIcon(mimeType: string): React.ComponentType<{ className?: string }> {
    if (mimeType.includes('folder')) return Folder
    if (mimeType.includes('document') || mimeType.includes('word')) return FileText
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return Table
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation
    if (mimeType.includes('image')) return ImageIcon
    if (mimeType.includes('video')) return Video
    if (mimeType.includes('audio')) return Music
    return File
}

/**
 * Returns a color class for the file icon based on MIME type.
 */
function getFileIconColor(mimeType: string): string {
    if (mimeType.includes('folder')) return 'text-status-warning'
    if (mimeType.includes('document') || mimeType.includes('word')) return 'text-status-info'
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-status-success'
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-international-orange'
    if (mimeType.includes('image')) return 'text-purple-500'
    return 'text-muted-foreground'
}

export function DriveTab({ isEnabled }: DriveTabProps) {
    const [files, setFiles] = useState<DriveFile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [breadcrumbs, setBreadcrumbs] = useState<FolderBreadcrumb[]>([
        { id: null, name: 'My Drive' },
    ])
    const [nextPageToken, setNextPageToken] = useState<string | null>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const loadFiles = useCallback(async (folderId: string | null, query?: string, pageToken?: string) => {
        const cacheKey = `${folderId || 'root'}:${query || ''}`

        // Check cache first (stale-while-revalidate)
        if (!pageToken) {
            const cached = folderCache.get(cacheKey)
            if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
                setFiles(cached.files)
                setIsLoading(false)
                // Still refresh in background
            }
        }

        setIsLoading(true)
        setError(null)

        const result = await browseDriveFiles(
            query || undefined,
            folderId || undefined,
            pageToken || undefined
        )

        if (result.error) {
            setError(result.error)
            setIsLoading(false)
            return
        }

        const newFiles = pageToken ? [...files, ...result.files] : result.files
        setFiles(newFiles)
        setNextPageToken(result.nextPageToken)
        setIsLoading(false)

        // Update cache
        if (!pageToken) {
            folderCache.set(cacheKey, { files: newFiles, timestamp: Date.now() })
        }
    }, [files])

    // Initial load
    useEffect(() => {
        if (isEnabled) {
            loadFiles(null)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEnabled])

    const handleSearch = useCallback((value: string) => {
        setSearchQuery(value)
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }
        searchTimeoutRef.current = setTimeout(() => {
            loadFiles(currentFolderId, value || undefined)
        }, 400)
    }, [currentFolderId, loadFiles])

    const navigateToFolder = useCallback((file: DriveFile) => {
        setCurrentFolderId(file.id)
        setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }])
        setSearchQuery('')
        loadFiles(file.id)
    }, [loadFiles])

    const navigateToBreadcrumb = useCallback((index: number) => {
        const crumb = breadcrumbs[index]
        setCurrentFolderId(crumb.id)
        setBreadcrumbs(breadcrumbs.slice(0, index + 1))
        setSearchQuery('')
        loadFiles(crumb.id)
    }, [breadcrumbs, loadFiles])

    const handleFileClick = useCallback((file: DriveFile) => {
        if (file.mimeType.includes('folder')) {
            navigateToFolder(file)
        } else if (file.webViewLink) {
            window.open(file.webViewLink, '_blank', 'noopener,noreferrer')
        }
    }, [navigateToFolder])

    if (!isEnabled) {
        return (
            <GoogleErrorDisplay
                error="Request had insufficient authentication scopes"
                feature="drive"
            />
        )
    }

    if (error) {
        return (
            <GoogleErrorDisplay
                error={error}
                feature="drive"
                onRetry={() => loadFiles(currentFolderId, searchQuery || undefined)}
            />
        )
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setViewMode('list')}
                        aria-label="List view"
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => setViewMode('grid')}
                        aria-label="Grid view"
                    >
                        <Grid3X3 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Breadcrumbs */}
            {breadcrumbs.length > 1 && (
                <nav aria-label="Folder navigation" className="flex items-center gap-1 text-sm">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigateToBreadcrumb(breadcrumbs.length - 2)}
                        className="h-7 px-2"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                        Back
                    </Button>
                    <span className="text-muted-foreground mx-1">/</span>
                    {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={crumb.id || 'root'}>
                            {index > 0 && (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <button
                                onClick={() => navigateToBreadcrumb(index)}
                                className={cn(
                                    'text-sm hover:text-foreground transition-colors truncate max-w-[120px]',
                                    index === breadcrumbs.length - 1
                                        ? 'text-foreground font-medium'
                                        : 'text-muted-foreground'
                                )}
                            >
                                {crumb.name}
                            </button>
                        </React.Fragment>
                    ))}
                </nav>
            )}

            {/* File List / Grid */}
            {isLoading && files.length === 0 ? (
                <div className="space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                            <Skeleton className="h-8 w-8 rounded" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-base font-semibold text-foreground mb-1">
                        {searchQuery ? 'No files found' : 'This folder is empty'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {searchQuery
                            ? `No results for "${searchQuery}". Try a different search.`
                            : 'Upload files to Google Drive to see them here.'
                        }
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                <div className="border rounded-lg divide-y">
                    {files.map((file) => {
                        const Icon = getFileIcon(file.mimeType)
                        const iconColor = getFileIconColor(file.mimeType)
                        const isFolder = file.mimeType.includes('folder')

                        return (
                            <button
                                key={file.id}
                                onClick={() => handleFileClick(file)}
                                className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors group"
                            >
                                <div className={cn('flex items-center justify-center h-8 w-8 rounded', iconColor)}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                        {file.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {file.modifiedTime
                                            ? new Date(file.modifiedTime).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })
                                            : ''
                                        }
                                        {file.size && !isFolder && (
                                            <span> · {formatFileSize(file.size)}</span>
                                        )}
                                    </p>
                                </div>
                                {!isFolder && (
                                    <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                )}
                                {isFolder && (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                            </button>
                        )
                    })}
                </div>
            ) : (
                /* Grid View */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {files.map((file) => {
                        const Icon = getFileIcon(file.mimeType)
                        const iconColor = getFileIconColor(file.mimeType)

                        return (
                            <button
                                key={file.id}
                                onClick={() => handleFileClick(file)}
                                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center group"
                            >
                                <div className={cn('flex items-center justify-center h-10 w-10 rounded-lg', iconColor)}>
                                    <Icon className="h-6 w-6" />
                                </div>
                                <p className="text-xs font-medium text-foreground truncate w-full">
                                    {file.name}
                                </p>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Load More */}
            {nextPageToken && (
                <div className="flex justify-center pt-4">
                    <Button
                        variant="secondary"
                        onClick={() => loadFiles(currentFolderId, searchQuery || undefined, nextPageToken)}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Loading...' : 'Load More'}
                    </Button>
                </div>
            )}
        </div>
    )
}
