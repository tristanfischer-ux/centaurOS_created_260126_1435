"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, Upload, X, FileIcon, Volume2, Check, ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react"
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
import { MultiSelect } from "@/components/ui/multi-select"
import { createTask } from "@/actions/tasks"
import { toast } from "sonner"
import { addDays } from "date-fns"
import { cn } from "@/lib/utils"
import { DatePickerWithShortcuts } from "@/components/ui/date-picker-with-shortcuts"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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
    defaultObjectiveId?: string
    children?: React.ReactNode
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

export function CreateTaskDialog({ objectives, members, teams = [], currentUserId, defaultObjectiveId, children }: CreateTaskDialogProps) {
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)
    // Default deadline to 7 days from now (can be cleared)
    const [date, setDate] = useState<Date | undefined>(() => addDays(new Date(), 7))
    // Default assignee to current user
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([currentUserId])
    // Default objective if provided
    const [selectedObjective, setSelectedObjective] = useState<string>(defaultObjectiveId || "")
    const [objectiveOpen, setObjectiveOpen] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [titleError, setTitleError] = useState<string | null>(null)
    const [descriptionError, setDescriptionError] = useState<string | null>(null)
    const [assigneeError, setAssigneeError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [showVoiceNudge, setShowVoiceNudge] = useState(false)
    const [description, setDescription] = useState("")

    // Check if user has seen voice recorder before
    useEffect(() => {
        const hasSeenVoiceRecorder = localStorage.getItem('hasSeenVoiceRecorder')
        if (!hasSeenVoiceRecorder) {
            setShowVoiceNudge(true)
            // Mark as seen after 5 seconds
            setTimeout(() => {
                setShowVoiceNudge(false)
                localStorage.setItem('hasSeenVoiceRecorder', 'true')
            }, 5000)
        }
    }, [])

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
                // Reset to smart defaults
                setDate(addDays(new Date(), 7))
                setSelectedAssignees([currentUserId])
                setSelectedObjective(defaultObjectiveId || "")
                setFiles([])
                setShowAdvanced(false)
                setDescription('')
                if (titleObjRef.current) titleObjRef.current.value = ''
            }, 300)
        } else {
            // When opening, set smart defaults
            setDate(addDays(new Date(), 7))
            setSelectedAssignees([currentUserId])
            setSelectedObjective(defaultObjectiveId || "")
            setShowAdvanced(false)
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
                setDescription('')
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
        setDescription(data.description);

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
    const handleFileSelect = (selectedFiles: File[]) => {
        addFiles(selectedFiles)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || [])
        handleFileSelect(newFiles)
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

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        
        const droppedFiles = Array.from(e.dataTransfer.files)
        handleFileSelect(droppedFiles)
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
                {children || (
                    <Button
                        size="sm"
                        variant="default"
                        className="touch-manipulation"
                        type="button"
                        onClick={handleMobileClick}
                    >
                        <Plus className="h-4 w-4" /> New Task
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[600px] bg-white text-slate-900 border-slate-200 max-h-[90dvh] overflow-y-auto">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <div className="flex items-start justify-between pr-8">
                            <div className="flex-1">
                                <DialogTitle>Create New Task</DialogTitle>
                                <DialogDescription>
                                    Assign a new task. Assign to an AI Agent for auto-execution.
                                </DialogDescription>
                            </div>
                            <div className="flex flex-col items-end gap-1 ml-4">
                                <div className="relative">
                                    <VoiceRecorder
                                        onTaskParsed={handleVoiceFill}
                                        className={`flex items-center gap-2 ${showVoiceNudge ? 'animate-pulse' : ''}`}
                                    />
                                    {showVoiceNudge && (
                                        <div className="absolute -top-8 right-0 bg-amber-500 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap animate-pulse">
                                            ✨ Try voice input
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 text-right max-w-[120px]">
                                    Speak to fill task details
                                </p>
                            </div>
                        </div>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Stage 1 - Required Fields (always visible) */}
                        <div className="grid gap-2">
                            <Label htmlFor="title">Task Title <span className="text-red-500">*</span></Label>
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
                                autoFocus
                            />
                            {titleError && (
                                <p id="title-error" className="text-sm text-red-600 mt-1" role="alert">
                                    {titleError}
                                </p>
                            )}
                        </div>

                        {/* Assignees - Multi-Select */}
                        <div className="grid gap-2">
                            <Label>Assignees <span className="text-red-500">*</span></Label>
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
                            <Popover open={objectiveOpen} onOpenChange={setObjectiveOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="secondary"
                                        role="combobox"
                                        aria-expanded={objectiveOpen}
                                        className="w-full justify-between bg-white border-slate-200"
                                        id="objective"
                                    >
                                        {selectedObjective
                                            ? objectives.find((o) => o.id === selectedObjective)?.title
                                            : "Select objective..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search objectives..." />
                                        <CommandList>
                                            <CommandEmpty>No objective found.</CommandEmpty>
                                            <CommandGroup>
                                                {objectives.map((obj) => (
                                                    <CommandItem
                                                        key={obj.id}
                                                        value={obj.title}
                                                        onSelect={() => {
                                                            setSelectedObjective(obj.id)
                                                            setObjectiveOpen(false)
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedObjective === obj.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {obj.title}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <input
                                type="hidden"
                                name="objective_id"
                                value={selectedObjective}
                                required
                            />
                        </div>

                        {/* Toggle Button */}
                        <div className="pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-slate-500"
                            >
                                {showAdvanced ? (
                                    <>
                                        <ChevronUp className="w-4 h-4 mr-1" />
                                        Hide Details
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown className="w-4 h-4 mr-1" />
                                        Add Details
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Stage 2 - Optional Fields (hidden until "Add details" is clicked) */}
                        {showAdvanced && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="description">Description <span className="text-slate-500 font-normal">(Optional)</span></Label>
                                    <Textarea
                                        id="description"
                                        name="description"
                                        placeholder="Provide specific details so the assignee knows what to do."
                                        className="h-24"
                                        enterKeyHint="done"
                                        ref={descRef}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        maxLength={500}
                                    />
                                    <p className="text-xs text-slate-500 text-right">{description.length}/500</p>
                                </div>

                                {/* Deadline */}
                                <div className="grid gap-2">
                                    <Label>Deadline (Optional)</Label>
                                    <DatePickerWithShortcuts
                                        date={date}
                                        onDateChange={setDate}
                                        placeholder="Pick a date"
                                    />
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
                                        onChange={handleFileInputChange}
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
                            </>
                        )}
                        {submitError && (
                            <div className="col-span-full">
                                <p className="text-sm text-red-600" role="alert">
                                    {submitError}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="default"
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
