"use client"

import { useState } from "react"
import { FileIcon, X, Loader2, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { deleteTaskAttachment } from "@/actions/tasks"

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
        <div className="space-y-2">
            {attachments.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-md group hover:border-slate-200 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-white p-1.5 rounded border border-slate-100">
                            <FileIcon className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate" title={file.file_name}>
                                {file.file_name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                {file.file_size ? (file.file_size / 1024).toFixed(1) + ' KB' : 'Unknown size'}
                                • {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Unknown date'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1">
                        {/* Download Link - constructed from Supabase Storage public URL logic usually, 
                            but for now we might need a download action or just a direct link if public.
                            Assuming authenticated access is needed, we ideally need a signed URL. 
                            For MVP, skipping direct download button if complex, but usually it's just a link.
                        */}

                        {canDelete && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                disabled={deletingId === file.id}
                                onClick={() => handleDelete(file.id, file.file_path)}
                            >
                                {deletingId === file.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <X className="h-3.5 w-3.5" />
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
