"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, CalendarIcon, Upload, X, FileIcon, Volume2 } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { createTask } from "@/actions/tasks"
import { toast } from "sonner"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

function getInitials(name: string | null) {
    if (!name) return '??'
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
}
import { VoiceRecorder } from "@/components/tasks/voice-recorder"

interface CreateTaskDialogProps {
    objectives: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
    teams?: { id: string; name: string }[]
    currentUserId: string
}

const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
]

export function CreateTaskDialog({ objectives, members, teams = [], currentUserId }: CreateTaskDialogProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [date, setDate] = useState<Date>()
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
    const [files, setFiles] = useState<File[]>([])
    const [titleError, setTitleError] = useState<string | null>(null)
    const [descriptionError, setDescriptionError] = useState<string | null>(null)
    const [assigneeError, setAssigneeError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)

    // Form Refs for manual value setting
    const titleObjRef = useRef<HTMLInputElement>(null)
    const descRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Mobile-specific dialog handler for iOS compatibility
    const handleMobileClick = (e: React.MouseEvent) => {
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
        }
    }

    // Handle dialog open state change with form reset
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset state after dialog close animation
            setTimeout(() => {
                setDate(undefined)
                setSelectedAssignees([])
                setFiles([])
                if (titleObjRef.current) titleObjRef.current.value = ''
                if (descRef.current) descRef.current.value = ''
            }, 300)
        }
    }


    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        
        // Reset errors
        setTitleError(null)
        setDescriptionError(null)
        setAssigneeError(null)
        setSubmitError(null)
        
        // Get form values
        const form = event.currentTarget
        const title = (form.elements.namedItem('title') as HTMLInputElement)?.value?.trim()
        const description = (form.elements.namedItem('description') as HTMLTextAreaElement)?.value?.trim()
        
        // Validate title
        if (!title) {
            setTitleError("Task title is required")
            return
        }
        
        // Validate assignees
        if (selectedAssignees.length === 0) {
            setAssigneeError("At least one assignee is required")
            return
        }
        
        setIsLoading(true)

        const formData = new FormData(form)

        // Append deadline if selected
        if (date) {
            formData.append('end_date', date.toISOString())
        }

        // Append assignee IDs (use first one as primary for backward compatibility)
        if (selectedAssignees.length > 0) {
            formData.set('assignee_id', selectedAssignees[0])
            // Also send full list for multi-assignee
            formData.set('assignee_ids', JSON.stringify(selectedAssignees))
        }

        // Append files
        files.forEach((file, idx) => {
            formData.append(`file_${idx}`, file)
        })
        formData.set('file_count', String(files.length))

        try {
            const result = await createTask(formData)

            if (result?.error) {
                setSubmitError(result.error)
                toast.error(result.error)
            } else {
                toast.success("Task created")
                setOpen(false)
                // Reset state
                setDate(undefined)
                setSelectedAssignees([])
                setFiles([])
                setTitleError(null)
                setDescriptionError(null)
                setAssigneeError(null)
                setSubmitError(null)
            }
        } catch (error) {
            setSubmitError("An unexpected error occurred")
            toast.error("An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const handleVoiceFill = (data: { title: string; description: string; assignee_type: string; due_date?: string }) => {
        if (titleObjRef.current) titleObjRef.current.value = data.title;
        if (descRef.current) descRef.current.value = data.description;

        // Try to set date
        if (data.due_date) {
            const parsed = new Date(data.due_date);
            if (!isNaN(parsed.getTime())) {
                setDate(parsed);
            }
        }

        // Try to map assignee
        if (data.assignee_type === "Self") {
            setSelectedAssignees([currentUserId]);
        } else if (data.assignee_type === "Legal_AI") {
            const ai = members.find(m => m.role === 'AI_Agent' && m.full_name?.toLowerCase().includes('legal')); // Heuristic
            if (ai) setSelectedAssignees([ai.id]);
        } else if (data.assignee_type === "General_AI") {
            const ai = members.find(m => m.role === 'AI_Agent' && !m.full_name?.toLowerCase().includes('legal'));
            if (ai) setSelectedAssignees([ai.id]);
        }
    }

    // Helper to format role for display
    const getRoleLabel = (role: string) => {
        if (role === 'AI_Agent') return '🤖'
        if (role === 'Founder') return '👑'
        if (role === 'Executive') return '💼'
        if (role === 'Apprentice') return '🎓'
        return ''
    }

    // Sort members: Current user first, then AI agents, then others alphabetically
    const sortedMembers = [...members].sort((a, b) => {
        if (a.id === currentUserId) return -1
        if (b.id === currentUserId) return 1
        if (a.role === 'AI_Agent' && b.role !== 'AI_Agent') return -1
        if (b.role === 'AI_Agent' && a.role !== 'AI_Agent') return 1
        return (a.full_name || '').localeCompare(b.full_name || '')
    })

    // Transform for MultiSelect
    const memberOptions = [
        ...teams.map(t => ({
            value: `team:${t.id}`,
            label: t.name,
            icon: '👥'
        })),
        ...sortedMembers.map(m => ({
            value: m.id,
            label: m.id === currentUserId ? 'Myself' : (m.full_name || 'Unknown'),
            icon: (
                <Avatar className="h-4 w-4 border border-slate-200 shrink-0">
                    <AvatarFallback className="text-[8px] bg-indigo-50 text-indigo-700 font-medium flex items-center justify-center">
                        {getInitials(m.full_name)}
                    </AvatarFallback>
                </Avatar>
            )
        }))
    ]

    // File handling
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || [])
        addFiles(newFiles)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const addFiles = (newFiles: File[]) => {
        const validFiles = newFiles.filter(file => {
            if (!ALLOWED_TYPES.includes(file.type)) {
                toast.error(`${file.name}: Invalid file type`)
                return false
            }
            if (file.size > MAX_FILE_SIZE) {
                toast.error(`${file.name}: File too large (max 10MB)`)
                return false
            }
            return true
        })

        const totalFiles = [...files, ...validFiles].slice(0, MAX_FILES)
        if (files.length + validFiles.length > MAX_FILES) {
            toast.warning(`Maximum ${MAX_FILES} files allowed`)
        }
        setFiles(totalFiles)
    }

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="primary"
                    className="touch-manipulation"
                    type="button"
                    onClick={handleMobileClick}
                >
                    <Plus className="h-4 w-4" /> New Task
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[600px] bg-white text-slate-900 border-slate-200 max-h-[90dvh] overflow-y-auto">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <div className="flex items-center justify-between pr-8">
                            <div>
                                <DialogTitle>Create New Task</DialogTitle>
                                <DialogDescription>
                                    Assign a new task. Assign to an AI Agent for auto-execution.
                                </DialogDescription>
                            </div>
                            <VoiceRecorder
                                onTaskParsed={handleVoiceFill}
                                className="flex items-center gap-2"
                            />
                        </div>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title">Task Title</Label>
                            <Input
                                id="title"
                                name="title"
                                placeholder="Review contract drafts..."
                                required
                                aria-required={true}
                                enterKeyHint="next"
                                ref={titleObjRef}
                                aria-describedby={titleError ? "title-error" : undefined}
                                aria-invalid={!!titleError}
                                className={titleError ? "border-red-500" : ""}
                                onChange={() => setTitleError(null)}
                            />
                            {titleError && (
                                <p id="title-error" className="text-sm text-red-600 mt-1" role="alert">
                                    {titleError}
                                </p>
                            )}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                name="description"
                                placeholder="Provide specific details so the assignee knows what to do."
                                className="h-24"
                                enterKeyHint="done"
                                ref={descRef}
                            />
                        </div>

                        {/* Assignees - Multi-Select */}
                        <div className="grid gap-2">
                            <Label>Assignees</Label>
                            <div aria-describedby={assigneeError ? "assignee-error" : undefined}>
                                <MultiSelect
                                    options={memberOptions}
                                    selected={selectedAssignees}
                                    onChange={(value) => {
                                        setSelectedAssignees(value)
                                        setAssigneeError(null)
                                    }}
                                    placeholder="Select people..."
                                    emptyMessage="No members found"
                                />
                            </div>
                            {assigneeError && (
                                <p id="assignee-error" className="text-sm text-red-600 mt-1" role="alert">
                                    {assigneeError}
                                </p>
                            )}
                        </div>

                        {/* Objective */}
                        <div className="grid gap-2">
                            <Label htmlFor="objective">Objective</Label>
                            <Select name="objective_id" required>
                                <SelectTrigger 
                                    id="objective"
                                    className="bg-white border-slate-200"
                                    aria-required={true}
                                >
                                    <SelectValue placeholder="Link to objective..." />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-slate-200 z-50">
                                    {objectives.map(obj => (
                                        <SelectItem key={obj.id} value={obj.id}>
                                            {obj.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Deadline */}
                        <div className="grid gap-2">
                            <Label>Deadline (Optional)</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-white border-slate-200 z-[100]">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                        className="bg-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* File Attachments */}
                        <div className="grid gap-2">
                            <Label htmlFor="file-upload">Attachments (Optional)</Label>
                            <div
                                className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
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
                                    Max {MAX_FILES} files, 10MB each
                                </p>
                            </div>
                            <input
                                ref={fileInputRef}
                                id="file-upload"
                                type="file"
                                multiple
                                accept={ALLOWED_TYPES.join(',')}
                                onChange={handleFileSelect}
                                className="hidden"
                                aria-label="Upload files"
                            />

                            {/* File List */}
                            {files.length > 0 && (
                                <div className="space-y-2 mt-2">
                                    {files.map((file, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-2 bg-slate-50 rounded-md px-3 py-2 text-sm"
                                        >
                                            <FileIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                            <span className="truncate flex-1">{file.name}</span>
                                            <span className="text-xs text-slate-400 shrink-0">
                                                {formatFileSize(file.size)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeFile(idx)}
                                                className="text-slate-400 hover:text-red-500"
                                                aria-label={`Remove ${file.name}`}
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {submitError && (
                            <div className="col-span-full">
                                <p className="text-sm text-red-600" role="alert">
                                    {submitError}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isLoading || selectedAssignees.length === 0}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Create Task
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
