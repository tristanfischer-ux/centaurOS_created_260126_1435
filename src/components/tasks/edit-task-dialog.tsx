"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { updateTaskDetails, updateTaskAssignees, uploadTaskAttachment, getTaskAttachments } from "@/actions/tasks"
import { AttachmentList } from "./attachment-list"
import { Database } from "@/types/database.types"

type Task = Database["public"]["Tables"]["tasks"]["Row"]

interface EditTaskDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: Task
    members: { id: string, full_name: string, role: string }[]
}

export function EditTaskDialog({ open, onOpenChange, task, members }: EditTaskDialogProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [title, setTitle] = useState(task.title)
    const [description, setDescription] = useState(task.description || "")
    const [assigneeId, setAssigneeId] = useState(task.assignee_id || "")

    // Attachments state
    const [attachments, setAttachments] = useState<any[]>([])
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    const loadAttachments = async () => {
        setIsLoadingAttachments(true)
        const res = await getTaskAttachments(task.id)
        if (res.data) {
            setAttachments(res.data)
        }
        setIsLoadingAttachments(false)
    }

    useEffect(() => {
        if (open) {
            // Reset fields to current task data
            setTitle(task.title)
            setDescription(task.description || "")
            setAssigneeId(task.assignee_id || "")
            loadAttachments()
        }
    }, [open, task])

    const handleSavePrimary = async () => {
        setIsLoading(true)

        // 1. Update Details
        if (title !== task.title || description !== task.description) {
            const res = await updateTaskDetails(task.id, { title, description })
            if (res.error) {
                toast.error(res.error)
                setIsLoading(false)
                return
            }
        }

        // 2. Update Assignee
        if (assigneeId && assigneeId !== task.assignee_id) {
            const res = await updateTaskAssignees(task.id, [assigneeId])
            if (res.error) {
                toast.error(res.error)
                setIsLoading(false)
                return
            }
        }

        toast.success("Task updated")
        setIsLoading(false)
        onOpenChange(false)
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return

        setIsUploading(true)
        const file = e.target.files[0]
        const formData = new FormData()
        formData.append('file', file)

        const res = await uploadTaskAttachment(task.id, formData)

        setIsUploading(false)
        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success("Attachment uploaded")
            loadAttachments() // Refresh list
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-baseline gap-2">
                        Edit Task
                        <span className="text-sm font-mono font-normal text-slate-400">#{task.task_number}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Task Title</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-white border-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-white border-slate-200 min-h-[100px]"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Assignee</Label>
                            <Select value={assigneeId} onValueChange={setAssigneeId}>
                                <SelectTrigger className="bg-white border-slate-200">
                                    <SelectValue placeholder="Select assignee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {members.map(m => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.full_name} {m.role === 'AI_Agent' ? '🤖' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label>Attachments</Label>
                            <div className="relative">
                                <input
                                    type="file"
                                    title="Upload attachment"
                                    aria-label="Upload attachment"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                />
                                <Button size="sm" variant="outline" disabled={isUploading} className="h-8">
                                    {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />}
                                    Add File
                                </Button>
                            </div>
                        </div>

                        {isLoadingAttachments ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <AttachmentList
                                taskId={task.id}
                                attachments={attachments}
                                canDelete={true}
                                onDelete={(id) => setAttachments(prev => prev.filter(f => f.id !== id))}
                            />
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSavePrimary} variant="primary" disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
