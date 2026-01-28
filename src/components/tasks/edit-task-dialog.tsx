"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, Upload, Check, ChevronsUpDown } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { toast } from "sonner"
import { updateTaskDetails, updateTaskAssignees, uploadTaskAttachment, getTaskAttachments } from "@/actions/tasks"
import { AttachmentList } from "./attachment-list"
import { Database } from "@/types/database.types"
import { cn } from "@/lib/utils"

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
    const [assigneeOpen, setAssigneeOpen] = useState(false)

    // Attachments state
    const [attachments, setAttachments] = useState<any[]>([])
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const loadAttachments = useCallback(async () => {
        setIsLoadingAttachments(true)
        const res = await getTaskAttachments(task.id)
        if (res.data) {
            setAttachments(res.data)
        }
        setIsLoadingAttachments(false)
    }, [task.id])

    useEffect(() => {
        if (open) {
            // Reset fields to current task data
            setTitle(task.title)
            setDescription(task.description || "")
            setAssigneeId(task.assignee_id || "")
            loadAttachments()
        }
    }, [open, task, loadAttachments])

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

    const handleFileUpload = async (file: File) => {
        setIsUploading(true)
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

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        const file = e.target.files[0]
        await handleFileUpload(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            await handleFileUpload(files[0])
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-baseline gap-2">
                        Edit Task
                        <span className="text-sm font-mono font-normal text-muted-foreground">#{task.task_number}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Task Title <span className="text-red-500">*</span></Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className=""
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="edit-task-description">Description <span className="text-slate-500 font-normal">(Optional)</span></Label>
                            <Textarea
                                id="edit-task-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="min-h-[100px]"
                                maxLength={500}
                            />
                            <p className="text-xs text-slate-500 text-right">{description.length}/500</p>
                        </div>

                        <div className="space-y-2">
                            <Label>Assignee</Label>
                            <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={assigneeOpen}
                                        className="w-full justify-between"
                                    >
                                        {assigneeId
                                            ? (() => {
                                                const member = members.find((m) => m.id === assigneeId)
                                                return member ? `${member.full_name} ${member.role === 'AI_Agent' ? '🤖' : ''}` : "Select assignee..."
                                            })()
                                            : "Select assignee..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search members..." />
                                        <CommandList>
                                            <CommandEmpty>No members found.</CommandEmpty>
                                            <CommandGroup>
                                                {members.map((member) => (
                                                    <CommandItem
                                                        key={member.id}
                                                        value={member.full_name || ''}
                                                        onSelect={() => {
                                                            setAssigneeId(member.id)
                                                            setAssigneeOpen(false)
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                assigneeId === member.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {member.full_name} {member.role === 'AI_Agent' ? '🤖' : ''}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <Label>Attachments</Label>
                        </div>
                        <div
                            className={cn(
                                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                                isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            )}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            role="button"
                            tabIndex={0}
                            aria-label="Click to upload files or drag and drop"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    fileInputRef.current?.click()
                                }
                            }}
                        >
                            <Upload className="h-6 w-6 mx-auto text-slate-400 mb-2" />
                            <p className="text-sm text-slate-500">
                                Click to upload or drag & drop
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                Single file upload
                            </p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            title="Upload attachment"
                            aria-label="Upload attachment"
                            className="hidden"
                            onChange={handleFileInputChange}
                            disabled={isUploading}
                        />

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
