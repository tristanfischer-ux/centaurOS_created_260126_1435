/**
 * DocsTab -- Filtered Google Drive view for Docs, Sheets, and Slides.
 *
 * @description Shows only Google Workspace document types with quick-create
 * buttons that open new documents in Google's editors (new tab).
 *
 * @component
 */

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GoogleErrorDisplay } from '../google-error-boundary'
import {
    Search,
    ExternalLink,
    FileText,
    Table,
    Presentation,
    Plus,
    File,
} from 'lucide-react'
import { browseDriveDocuments } from '@/actions/google-drive'
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

interface DocsTabProps {
    isEnabled: boolean
}

type DocFilter = 'all' | 'docs' | 'sheets' | 'slides'

/** Google's new document creation URLs */
const CREATE_URLS = {
    docs: 'https://docs.google.com/document/create',
    sheets: 'https://docs.google.com/spreadsheets/create',
    slides: 'https://docs.google.com/presentation/create',
} as const

/**
 * Returns the appropriate icon for a Google Workspace document type.
 */
function getDocIcon(mimeType: string): React.ComponentType<{ className?: string }> {
    if (mimeType.includes('document')) return FileText
    if (mimeType.includes('spreadsheet')) return Table
    if (mimeType.includes('presentation')) return Presentation
    return File
}

/**
 * Returns a color class for the document icon.
 */
function getDocIconColor(mimeType: string): string {
    if (mimeType.includes('document')) return 'text-status-info'
    if (mimeType.includes('spreadsheet')) return 'text-status-success'
    if (mimeType.includes('presentation')) return 'text-international-orange'
    return 'text-muted-foreground'
}

/**
 * Returns a human-readable document type label.
 */
function getDocTypeLabel(mimeType: string): string {
    if (mimeType.includes('document')) return 'Google Doc'
    if (mimeType.includes('spreadsheet')) return 'Google Sheet'
    if (mimeType.includes('presentation')) return 'Google Slides'
    return 'Document'
}

/** In-memory cache for document listings */
const docsCache = new Map<string, { files: DriveFile[]; timestamp: number }>()
const CACHE_TTL_MS = 60_000

export function DocsTab({ isEnabled }: DocsTabProps) {
    const [files, setFiles] = useState<DriveFile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [filter, setFilter] = useState<DocFilter>('all')
    const [nextPageToken, setNextPageToken] = useState<string | null>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const loadDocs = useCallback(async (docFilter: DocFilter, query?: string, pageToken?: string) => {
        const cacheKey = `${docFilter}:${query || ''}`

        // Check cache first
        if (!pageToken) {
            const cached = docsCache.get(cacheKey)
            if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
                setFiles(cached.files)
                setIsLoading(false)
            }
        }

        setIsLoading(true)
        setError(null)

        const mimeFilter = docFilter === 'all' ? undefined : docFilter
        const result = await browseDriveDocuments(
            query || undefined,
            mimeFilter,
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

        if (!pageToken) {
            docsCache.set(cacheKey, { files: newFiles, timestamp: Date.now() })
        }
    }, [files])

    // Initial load
    useEffect(() => {
        if (isEnabled) {
            loadDocs('all')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEnabled])

    const handleSearch = useCallback((value: string) => {
        setSearchQuery(value)
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }
        searchTimeoutRef.current = setTimeout(() => {
            loadDocs(filter, value || undefined)
        }, 400)
    }, [filter, loadDocs])

    const handleFilterChange = useCallback((value: string) => {
        const newFilter = value as DocFilter
        setFilter(newFilter)
        loadDocs(newFilter, searchQuery || undefined)
    }, [searchQuery, loadDocs])

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
                onRetry={() => loadDocs(filter, searchQuery || undefined)}
            />
        )
    }

    return (
        <div className="space-y-4">
            {/* Quick Create Buttons */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground mr-1">Create:</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(CREATE_URLS.docs, '_blank', 'noopener,noreferrer')}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <FileText className="h-3.5 w-3.5 text-status-info" />
                    Doc
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(CREATE_URLS.sheets, '_blank', 'noopener,noreferrer')}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <Table className="h-3.5 w-3.5 text-status-success" />
                    Sheet
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(CREATE_URLS.slides, '_blank', 'noopener,noreferrer')}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <Presentation className="h-3.5 w-3.5 text-international-orange" />
                    Slides
                </Button>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Tabs value={filter} onValueChange={handleFilterChange}>
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="docs">Docs</TabsTrigger>
                        <TabsTrigger value="sheets">Sheets</TabsTrigger>
                        <TabsTrigger value="slides">Slides</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Document List */}
            {isLoading && files.length === 0 ? (
                <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                            <Skeleton className="h-8 w-8 rounded" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-56" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-base font-semibold text-foreground mb-1">
                        {searchQuery ? 'No documents found' : 'No documents yet'}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        {searchQuery
                            ? `No results for "${searchQuery}". Try a different search.`
                            : 'Create a new Google Doc, Sheet, or Slides presentation to get started.'
                        }
                    </p>
                </div>
            ) : (
                <div className="border rounded-lg divide-y">
                    {files.map((file) => {
                        const Icon = getDocIcon(file.mimeType)
                        const iconColor = getDocIconColor(file.mimeType)
                        const typeLabel = getDocTypeLabel(file.mimeType)

                        return (
                            <a
                                key={file.id}
                                href={file.webViewLink || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
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
                                        {typeLabel}
                                        {file.modifiedTime && (
                                            <span>
                                                {' · '}
                                                {new Date(file.modifiedTime).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                        )
                    })}
                </div>
            )}

            {/* Load More */}
            {nextPageToken && (
                <div className="flex justify-center pt-4">
                    <Button
                        variant="secondary"
                        onClick={() => loadDocs(filter, searchQuery || undefined, nextPageToken)}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Loading...' : 'Load More'}
                    </Button>
                </div>
            )}
        </div>
    )
}
