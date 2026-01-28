"use client"

import { useState, useMemo } from "react"
import { FileIcon, X, Loader2, Paperclip, FileText, Image, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { deleteTaskAttachment } from "@/actions/tasks"
import { createClient } from "@/lib/supabase/client"

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

    // Get public URL from file_path
    const getFileUrl = (filePath: string) => {
        const { data } = supabase.storage
            .from('task-files')
            .getPublicUrl(filePath)
        return data.publicUrl
    }

    const handleDelete = async (fileId: string, filePath: string) => {
        if (!confirm("Are you sure you want to delete this attachment?")) return

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
            <div className="text-xs text-slate-400 italic flex items-center gap-2 py-2">
                <Paperclip className="h-3 w-3" /> No attachments
            </div>
        )
    }

    return (
        <>
            <div className="space-y-2">
                {attachments.map((file) => {
                    const fileType = getFileType(file.file_name)
                    const fileUrl = getFileUrl(file.file_path)
                    
                    return (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-md group hover:border-slate-200 transition-colors">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                {fileType === 'image' ? (
                                    <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                                        <img 
                                            src={fileUrl} 
                                            alt={file.file_name}
                                            loading="lazy"
                                            className="w-full h-full object-cover cursor-pointer"
                                            onClick={() => setPreviewFile(file)}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                                        {fileType === 'pdf' ? (
                                            <FileText className="h-5 w-5 text-red-500" />
                                        ) : (
                                            <FileIcon className="h-5 w-5 text-blue-500" />
                                        )}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-700 truncate" title={file.file_name}>
                                        {file.file_name}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
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
                                                className="min-h-[44px] min-w-[44px] h-9 w-9 p-0 text-slate-400 hover:text-slate-600"
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
                                {canDelete && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="min-h-[44px] min-w-[44px] h-9 w-9 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                    disabled={deletingId === file.id}
                                                    onClick={() => handleDelete(file.id, file.file_path)}
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
                <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                    {previewFile && (
                        <div className="p-4">
                            <div className="mb-2">
                                <h3 className="text-sm font-medium text-slate-900 truncate">{previewFile.file_name}</h3>
                                <p className="text-xs text-slate-400">{formatFileSize(previewFile.file_size)}</p>
                            </div>
                            {getFileType(previewFile.file_name) === 'image' && (
                                <img 
                                    src={getFileUrl(previewFile.file_path)} 
                                    alt={previewFile.file_name}
                                    loading="lazy"
                                    className="w-full h-auto max-h-[80vh] object-contain rounded"
                                />
                            )}
                            {getFileType(previewFile.file_name) === 'pdf' && (
                                <iframe 
                                    src={getFileUrl(previewFile.file_path)}
                                    className="w-full h-[80vh] rounded border"
                                    title={previewFile.file_name}
                                />
                            )}
                            {getFileType(previewFile.file_name) === 'other' && (
                                <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
                                    <FileIcon className="h-16 w-16 mb-4" />
                                    <p className="text-sm">Preview not available for this file type</p>
                                    <a 
                                        href={getFileUrl(previewFile.file_path)} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="mt-4 text-sm text-blue-600 hover:underline"
                                    >
                                        Open in new tab
                                    </a>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
