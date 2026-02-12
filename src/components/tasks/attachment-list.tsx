"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { FileIcon, X, Loader2, Paperclip, FileText, Eye, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { deleteTaskAttachment } from "@/actions/tasks"
import { createClient } from "@/lib/supabase/client"
import { sanitizeImageSrc, sanitizeFileSrc } from "@/lib/security/url-validation"

interface Attachment {
    id: string
    file_name: string
    file_path: string
    file_size: number | null
    created_at: string | null
}

interface AttachmentListProps {
    taskId: string
    attachments: Attachment[]
    canDelete?: boolean
    onDelete?: (fileId: string) => void // Callback to update parent state if needed
}

export function AttachmentList({ taskId, attachments, canDelete = false, onDelete }: AttachmentListProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [previewFile, setPreviewFile] = useState<Attachment | null>(null)
    const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
    const [downloadingId, setDownloadingId] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, path: string } | null>(null)
    const supabase = useMemo(() => createClient(), [])

    // Helper to get file type
    const getFileType = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase()
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image'
        if (['pdf'].includes(ext || '')) return 'pdf'
        return 'other'
    }

    // Helper to format file size
    const formatFileSize = (bytes: number | null) => {
        if (!bytes) return 'Unknown size'
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    // Get signed URL for file (valid for 1 hour)
    const getFileUrl = useCallback(async (filePath: string) => {
        // Check if we already have a URL cached
        if (fileUrls[filePath]) {
            return fileUrls[filePath]
        }

        try {
            const { data, error } = await supabase.storage
                .from('task-files')
                .createSignedUrl(filePath, 3600) // 1 hour expiry

            if (error) {
                console.error('Error creating signed URL:', error)
                return null
            }

            // Cache the URL
            setFileUrls(prev => ({ ...prev, [filePath]: data.signedUrl }))
            return data.signedUrl
        } catch (err) {
            console.error('Exception creating signed URL:', err)
            return null
        }
    }, [fileUrls, supabase.storage])

    // Download file
    const handleDownload = async (file: Attachment) => {
        setDownloadingId(file.id)
        try {
            const { data, error } = await supabase.storage
                .from('task-files')
                .download(file.file_path)

            if (error) {
                toast.error('Failed to download file')
                console.error('Download error:', error)
                return
            }

            // Create blob URL and trigger download
            const url = URL.createObjectURL(data)
            const a = document.createElement('a')
            a.href = url
            a.download = file.file_name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            
            toast.success('Download started')
        } catch (err) {
            console.error('Download exception:', err)
            toast.error('Failed to download file')
        } finally {
            setDownloadingId(null)
        }
    }

    // Preload URLs for all attachments
    useEffect(() => {
        attachments.forEach(file => {
            getFileUrl(file.file_path)
        })
    }, [attachments, getFileUrl])

    const handleDeleteClick = (fileId: string, filePath: string) => {
        setDeleteConfirm({ id: fileId, path: filePath })
    }

    const handleDeleteConfirm = async () => {
        if (!deleteConfirm) return
        
        const { id: fileId, path: filePath } = deleteConfirm
        setDeleteConfirm(null)
        setDeletingId(fileId)
        
        const res = await deleteTaskAttachment(fileId, filePath, taskId)
        setDeletingId(null)

        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success("Attachment deleted")
            if (onDelete) onDelete(fileId)
        }
    }

    if (attachments.length === 0) {
        return (
            <div className="text-xs text-muted-foreground italic flex items-center gap-2 py-2">
                <Paperclip className="h-3 w-3" /> No attachments
            </div>
        )
    }

    return (
        <>
            <div className="space-y-2">
                {attachments.map((file) => {
                    const fileType = getFileType(file.file_name)
                    const fileUrl = fileUrls[file.file_path]
                    
                    return (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-muted border border-border rounded-md group hover:border transition-colors">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                {/* SECURITY: Sanitize signed URLs for defense-in-depth */}
                                {fileType === 'image' && fileUrl && sanitizeImageSrc(fileUrl) ? (
                                    <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                                        <img 
                                            src={sanitizeImageSrc(fileUrl)!} 
                                            alt={file.file_name}
                                            loading="lazy"
                                            className="w-full h-full object-cover cursor-pointer"
                                            onClick={() => setPreviewFile(file)}
                                            onError={(e) => {
                                                // Hide broken image
                                                e.currentTarget.style.display = 'none'
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                        {fileType === 'pdf' ? (
                                            <FileText className="h-5 w-5 text-destructive" />
                                        ) : (
                                            <FileIcon className="h-5 w-5 text-electric-blue" />
                                        )}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate" title={file.file_name}>
                                        {file.file_name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {formatFileSize(file.file_size)}
                                        • {file.created_at ? new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="min-h-[44px] min-w-[44px] h-9 w-9 p-0 text-muted-foreground hover:text-muted-foreground"
                                                onClick={() => setPreviewFile(file)}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Preview attachment</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="min-h-[44px] min-w-[44px] h-9 w-9 p-0 text-muted-foreground hover:text-muted-foreground"
                                                disabled={downloadingId === file.id}
                                                onClick={() => handleDownload(file)}
                                            >
                                                {downloadingId === file.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Download className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Download attachment</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                {canDelete && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="min-h-[44px] min-w-[44px] h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-status-error-light"
                                                    disabled={deletingId === file.id}
                                                    onClick={() => handleDeleteClick(file.id, file.file_path)}
                                                    aria-label="Delete attachment"
                                                >
                                                    {deletingId === file.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <X className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Delete attachment</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Preview Modal */}
            <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
                <DialogContent size="lg" className="max-h-[90vh] p-0">
                    {previewFile && (
                        <div className="p-4">
                            <DialogHeader className="mb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                        <DialogTitle className="text-sm font-medium text-foreground truncate">
                                            {previewFile.file_name}
                                        </DialogTitle>
                                        <p className="text-xs text-muted-foreground">{formatFileSize(previewFile.file_size)}</p>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="ml-4"
                                        onClick={() => handleDownload(previewFile)}
                                        disabled={downloadingId === previewFile.id}
                                    >
                                        {downloadingId === previewFile.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <Download className="h-4 w-4 mr-2" />
                                        )}
                                        Download
                                    </Button>
                                </div>
                            </DialogHeader>
                            {/* SECURITY: Sanitize URLs before rendering */}
                            {getFileType(previewFile.file_name) === 'image' && fileUrls[previewFile.file_path] && sanitizeImageSrc(fileUrls[previewFile.file_path]) && (
                                <img 
                                    src={sanitizeImageSrc(fileUrls[previewFile.file_path])!} 
                                    alt={previewFile.file_name}
                                    loading="lazy"
                                    className="w-full h-auto max-h-[80vh] object-contain rounded"
                                    onError={() => {
                                        toast.error('Failed to load image preview')
                                    }}
                                />
                            )}
                            {getFileType(previewFile.file_name) === 'pdf' && fileUrls[previewFile.file_path] && (() => {
                                const sanitizedUrl = sanitizeFileSrc(fileUrls[previewFile.file_path])
                                if (!sanitizedUrl) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                                            <FileText className="h-16 w-16 mb-4 text-destructive" />
                                            <p className="text-sm mb-2">Unable to preview PDF</p>
                                            <p className="text-xs mb-4 text-muted-foreground">The file URL could not be validated</p>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleDownload(previewFile)}
                                                disabled={downloadingId === previewFile.id}
                                            >
                                                {downloadingId === previewFile.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : (
                                                    <Download className="h-4 w-4 mr-2" />
                                                )}
                                                Download PDF Instead
                                            </Button>
                                        </div>
                                    )
                                }
                                return (
                                    <div className="w-full h-[80vh]">
                                        <iframe 
                                            src={`${sanitizedUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                                            className="w-full h-full rounded border bg-muted"
                                            title={previewFile.file_name}
                                            onError={(e) => {
                                                console.error('PDF iframe error:', e)
                                                toast.error('Failed to load PDF preview. Try downloading instead.')
                                            }}
                                        />
                                    </div>
                                )
                            })()}
                            {(() => {
                                const fileType = getFileType(previewFile.file_name)
                                const hasUrl = fileUrls[previewFile.file_path]
                                
                                // Only show "no preview" for truly unsupported types or missing URLs
                                if (fileType === 'other' || !hasUrl) {
                                    return (
                                        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                                            <FileIcon className="h-16 w-16 mb-4" />
                                            <p className="text-sm mb-2">
                                                {!hasUrl ? 'Loading preview...' : 'Preview not available for this file type'}
                                            </p>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleDownload(previewFile)}
                                                disabled={downloadingId === previewFile.id}
                                            >
                                                {downloadingId === previewFile.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : (
                                                    <Download className="h-4 w-4 mr-2" />
                                                )}
                                                Download File
                                            </Button>
                                        </div>
                                    )
                                }
                                return null
                            })()}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Attachment?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this attachment? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
