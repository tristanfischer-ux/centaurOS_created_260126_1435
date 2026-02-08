/**
 * DriveFilePicker - Dialog for browsing and selecting Google Drive files.
 *
 * @description Opens a dialog that lets users search and browse their Google Drive
 * files. Selected files are passed back via the onSelect callback. Used alongside
 * the existing file upload button for task and message attachments.
 *
 * @component
 *
 * @example
 * <DriveFilePicker
 *   open={isPickerOpen}
 *   onOpenChange={setIsPickerOpen}
 *   onSelect={(file) => handleDriveFileSelect(file)}
 * />
 */

'use client'

import { useState, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Search,
    FileText,
    Table2,
    Image,
    Video,
    Music,
    Folder,
    File,
    Presentation,
    ChevronLeft,
    Loader2,
    HardDrive,
} from 'lucide-react'
import { browseDriveFiles } from '@/actions/google-drive'
import { cn } from '@/lib/utils'

/**
 * Format a file size from bytes to a human-readable string.
 * Inlined here to avoid importing server-only googleapis module tree.
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

interface DriveFileSelection {
    id: string
    name: string
    mimeType: string
    webViewLink: string | null
}

interface DriveFilePickerProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void
    /** Called when user selects a file */
    onSelect: (file: DriveFileSelection) => void
}

interface DriveFileItem {
    id: string
    name: string
    mimeType: string
    iconLink: string | null
    thumbnailLink: string | null
    webViewLink: string | null
    size: string | null
    modifiedTime: string | null
}

const ICON_MAP: Record<string, typeof File> = {
    'folder': Folder,
    'file-text': FileText,
    'table': Table2,
    'presentation': Presentation,
    'image': Image,
    'video': Video,
    'music': Music,
    'file': File,
}

function getIconForMimeType(mimeType: string): typeof File {
    if (mimeType.includes('folder')) return Folder
    if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('pdf')) return FileText
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return Table2
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation
    if (mimeType.includes('image')) return Image
    if (mimeType.includes('video')) return Video
    if (mimeType.includes('audio')) return Music
    return File
}

export function DriveFilePicker({ open, onOpenChange, onSelect }: DriveFilePickerProps) {
    const [files, setFiles] = useState<DriveFileItem[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([])
    const [nextPageToken, setNextPageToken] = useState<string | null>(null)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hasLoaded, setHasLoaded] = useState(false)

    const currentFolderId = folderStack.length > 0
        ? folderStack[folderStack.length - 1].id
        : undefined

    const loadFiles = useCallback(async (
        query?: string,
        folderId?: string,
        pageToken?: string
    ): Promise<void> => {
        if (pageToken) {
            setIsLoadingMore(true)
        } else {
            setIsLoading(true)
            setFiles([])
        }
        setError(null)

        const result = await browseDriveFiles(query || undefined, folderId, pageToken)

        if (result.error) {
            setError(result.error)
        }

        if (pageToken) {
            setFiles(prev => [...prev, ...result.files])
        } else {
            setFiles(result.files)
        }

        setNextPageToken(result.nextPageToken)
        setIsLoading(false)
        setIsLoadingMore(false)
        setHasLoaded(true)
    }, [])

    // Load files when dialog opens
    const handleOpenChange = useCallback((nextOpen: boolean) => {
        onOpenChange(nextOpen)
        if (nextOpen && !hasLoaded) {
            loadFiles()
        }
    }, [onOpenChange, hasLoaded, loadFiles])

    function handleSearch(): void {
        setFolderStack([])
        loadFiles(searchQuery)
    }

    function handleFolderOpen(folderId: string, folderName: string): void {
        setFolderStack(prev => [...prev, { id: folderId, name: folderName }])
        setSearchQuery('')
        loadFiles(undefined, folderId)
    }

    function handleGoBack(): void {
        const newStack = [...folderStack]
        newStack.pop()
        setFolderStack(newStack)
        const parentId = newStack.length > 0 ? newStack[newStack.length - 1].id : undefined
        loadFiles(undefined, parentId)
    }

    function handleFileSelect(file: DriveFileItem): void {
        if (file.mimeType.includes('folder')) {
            handleFolderOpen(file.id, file.name)
            return
        }

        onSelect({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            webViewLink: file.webViewLink,
        })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent size="md" className="max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <DialogTitle>Select from Google Drive</DialogTitle>
                    </div>
                </DialogHeader>

                {/* Search Bar */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search your Drive..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSearch()
                            }}
                            className="pl-9"
                        />
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSearch}
                        disabled={isLoading}
                    >
                        Search
                    </Button>
                </div>

                {/* Breadcrumb Navigation */}
                {folderStack.length > 0 && (
                    <div className="flex items-center gap-1 text-sm">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleGoBack}
                            className="h-7 px-2"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                            Back
                        </Button>
                        <span className="text-muted-foreground">/</span>
                        {folderStack.map((folder, idx) => (
                            <span key={folder.id} className="text-muted-foreground">
                                {idx > 0 && ' / '}
                                <span className="text-foreground font-medium">{folder.name}</span>
                            </span>
                        ))}
                    </div>
                )}

                {/* File List */}
                <ScrollArea className="flex-1 min-h-[300px] max-h-[50vh]">
                    {isLoading ? (
                        <div className="space-y-2 p-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 p-3">
                                    <Skeleton className="h-8 w-8 rounded" />
                                    <div className="flex-1 space-y-1">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-3 w-1/4" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-sm text-destructive">{error}</p>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => loadFiles(searchQuery, currentFolderId)}
                                className="mt-4"
                            >
                                Retry
                            </Button>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <HardDrive className="h-10 w-10 text-muted-foreground mb-3" />
                            <p className="text-sm text-muted-foreground">
                                {searchQuery ? 'No files match your search' : 'No files found'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1 p-1">
                            {files.map((file) => {
                                const FileIcon = getIconForMimeType(file.mimeType)
                                const isFolder = file.mimeType.includes('folder')

                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => handleFileSelect(file)}
                                        className={cn(
                                            'w-full flex items-center gap-3 p-3 rounded-lg text-left',
                                            'hover:bg-muted transition-colors',
                                            'focus:outline-none focus:ring-2 focus:ring-ring'
                                        )}
                                    >
                                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                                            <FileIcon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {isFolder ? 'Folder' : formatFileSize(file.size)}
                                                {file.modifiedTime && (
                                                    <> &middot; {new Date(file.modifiedTime).toLocaleDateString()}</>
                                                )}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}

                            {/* Load More */}
                            {nextPageToken && (
                                <div className="pt-2 pb-1 text-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => loadFiles(searchQuery, currentFolderId, nextPageToken)}
                                        disabled={isLoadingMore}
                                    >
                                        {isLoadingMore ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : null}
                                        Load More
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
