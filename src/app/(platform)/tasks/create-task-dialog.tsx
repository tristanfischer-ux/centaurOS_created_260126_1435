"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, Upload, X, FileIcon, Check, ChevronDown, ChevronUp, Target, ChevronsUpDown, Sparkles } from "lucide-react"
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
import { MultiSelect } from "@/components/ui/multi-select"
import { createTask } from "@/actions/tasks"
import { toast } from "sonner"
import { addDays } from "date-fns"
import { cn } from "@/lib/utils"
import { DatePickerWithShortcuts } from "@/components/ui/date-picker-with-shortcuts"
import { UserAvatar } from "@/components/ui/user-avatar"
import { PrivacyShareControl, type ShareTarget } from "@/components/ui/privacy-share-control"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SmartHintBar } from "@/components/smart/smart-hint-bar"

import type { SmartGoalContext, SmartGoalSuggestion } from "@/actions/smart-goals"

interface CreateTaskDialogProps {
    objectives: { id: string; title: string }[]
    members: { id: string; full_name: string; role: string }[]
    teams?: { id: string; name: string }[]
    currentUserId: string
    defaultObjectiveId?: string
    children?: React.ReactNode
    /** Pre-fill the task title from contextual CTAs */
    prefillTitle?: string
    /** Pre-fill the task description from contextual CTAs */
    prefillDescription?: string
    /** Pre-fill the objective ID */
    prefillObjectiveId?: string
    /** Source context for AI-powered refinement */
    prefillContext?: SmartGoalContext
    /** Control open state externally */
    externalOpen?: boolean
    /** Callback when open state changes externally */
    onExternalOpenChange?: (open: boolean) => void
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

export function CreateTaskDialog({ objectives, members, teams = [], currentUserId, defaultObjectiveId, children, prefillTitle, prefillDescription, prefillObjectiveId, prefillContext, externalOpen, onExternalOpenChange }: CreateTaskDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = externalOpen !== undefined ? externalOpen : internalOpen
    const setOpenState = onExternalOpenChange || setInternalOpen
    const [isLoading, setIsLoading] = useState(false)
    const [prefillConsumed, setPrefillConsumed] = useState(false)

    // Auto-open dialog when prefillTitle is provided (e.g. from ?prefill= URL param)
    useEffect(() => {
        if (prefillTitle && !prefillConsumed) {
            setPrefillConsumed(true)
            setInternalOpen(true)
        }
    }, [prefillTitle, prefillConsumed])
    const [showAdvanced, setShowAdvanced] = useState(false)
    // Track title for SMART hint bar
    const [titleValue, setTitleValue] = useState("")
    // Default start date to today, deadline to 7 days from now (both clearable)
    const [startDate, setStartDate] = useState<Date | undefined>(() => new Date())
    const [date, setDate] = useState<Date | undefined>(() => addDays(new Date(), 7))
    // Default assignee to current user
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([currentUserId])
    // Default objective if provided
    const [selectedObjective, setSelectedObjective] = useState<string>(defaultObjectiveId || prefillObjectiveId || "")
    const [objectiveOpen, setObjectiveOpen] = useState(false)
    const [files, setFiles] = useState<File[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [titleError, setTitleError] = useState<string | null>(null)
    const [descriptionError, setDescriptionError] = useState<string | null>(null)
    const [assigneeError, setAssigneeError] = useState<string | null>(null)
    const [objectiveError, setObjectiveError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [description, setDescription] = useState("")
    const [isPrivate, setIsPrivate] = useState(false)
    const [sharedWith, setSharedWith] = useState<ShareTarget[]>([])

    // Form Refs for manual value setting
    const titleObjRef = useRef<HTMLInputElement>(null)
    const descRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Mobile-specific dialog handler for iOS compatibility
    const handleMobileClick = (e: React.MouseEvent) => {
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            e.preventDefault()
            e.stopPropagation()
            setOpenState(true)
        }
    }

    // Handle dialog open state change with form reset
    const handleOpenChange = (newOpen: boolean) => {
        setOpenState(newOpen)
        if (!newOpen) {
            // Reset state after dialog close animation
            setTimeout(() => {
                // Reset to smart defaults
                setStartDate(new Date())
                setDate(addDays(new Date(), 7))
                setSelectedAssignees([currentUserId])
                setSelectedObjective(defaultObjectiveId || prefillObjectiveId || "")
                setFiles([])
                setShowAdvanced(false)
                setDescription('')
                setTitleValue('')
                setIsPrivate(false)
                setSharedWith([])
                if (titleObjRef.current) titleObjRef.current.value = ''
            }, 300)
        } else {
            // When opening, set smart defaults + prefill
            setStartDate(new Date())
            setDate(addDays(new Date(), 7))
            setSelectedAssignees([currentUserId])
            setSelectedObjective(defaultObjectiveId || prefillObjectiveId || "")
            setShowAdvanced(!!prefillDescription)
            if (prefillTitle) {
                setTitleValue(prefillTitle)
                // Set input value after render
                setTimeout(() => {
                    if (titleObjRef.current) titleObjRef.current.value = prefillTitle
                }, 50)
            }
            if (prefillDescription) {
                setDescription(prefillDescription)
            }
        }
    }

    /** Handle accepting a SMART suggestion from the hint bar */
    const handleAcceptSmartSuggestion = (suggestion: SmartGoalSuggestion) => {
        setTitleValue(suggestion.title)
        if (titleObjRef.current) titleObjRef.current.value = suggestion.title
        if (suggestion.description && !description) {
            setDescription(suggestion.description)
            setShowAdvanced(true)
        }
    }


    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        
        // Reset errors
        setTitleError(null)
        setDescriptionError(null)
        setAssigneeError(null)
        setObjectiveError(null)
        setSubmitError(null)
        
        // CRITICAL: Check if objectives exist at all
        if (!hasObjectives) {
            setSubmitError("Cannot create task: No objectives exist. Create an objective first.")
            toast.error("Create an objective before creating tasks")
            return
        }
        
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
        
        // CRITICAL: Validate objective is selected
        if (!selectedObjective || selectedObjective.trim() === '') {
            setObjectiveError("You must select an objective for this task")
            toast.error("Please select an objective")
            return
        }
        
        setIsLoading(true)

        const formData = new FormData(form)

        // Append start date if selected
        if (startDate) {
            formData.append('start_date', startDate.toISOString())
        }

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

        // Append privacy settings
        formData.set('is_private', String(isPrivate))
        if (isPrivate && sharedWith.length > 0) {
            formData.set('share_with', JSON.stringify(sharedWith))
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
                setOpenState(false)
                // Reset state
                setStartDate(undefined)
                setDate(undefined)
                setSelectedAssignees([])
                setFiles([])
                setDescription('')
                setTitleError(null)
                setDescriptionError(null)
                setAssigneeError(null)
                setObjectiveError(null)
                setSubmitError(null)
            }
        } catch (error) {
            console.error('[CreateTask] Submission failed:', {
                error: error instanceof Error ? error.message : 'Unknown error',
            })
            setSubmitError("Failed to create task. Please try again.")
            toast.error("Failed to create task. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

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
                <UserAvatar
                    name={m.full_name}
                    role={m.role}
                    size="xs"
                    className="shrink-0"
                />
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

    // Check if objectives exist
    const hasObjectives = objectives.length > 0

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
                        disabled={!hasObjectives}
                        title={!hasObjectives ? "Create an objective first" : undefined}
                    >
                        <Plus className="h-4 w-4" /> New Task
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent size="md" className="w-[calc(100vw-2rem)] bg-background text-foreground border max-h-[90dvh] overflow-y-auto">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                        <DialogDescription>
                            {!hasObjectives ? (
                                <span className="text-destructive">
                                    ⚠️ You must create at least one objective before creating tasks.
                                </span>
                            ) : (
                                "Assign a new task. Assign to an AI Agent for auto-execution."
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {/* Stage 1 - Required Fields (always visible) */}
                        <div className="grid gap-2">
                            <Label htmlFor="title">
                                Task Title <span className="text-destructive ml-1" aria-label="required">*</span>
                            </Label>
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
                                className={cn(titleError && "border-destructive")}
                                onChange={(e) => {
                                    setTitleError(null)
                                    setTitleValue(e.target.value)
                                }}
                                autoFocus
                            />
                            {titleError && (
                                <p id="title-error" className="text-sm text-destructive mt-1" role="alert">
                                    {titleError}
                                </p>
                            )}

                            {/* SMART Hint Bar - provides real-time SMART feedback */}
                            <SmartHintBar
                                text={titleValue}
                                type="task"
                                context={prefillContext}
                                onAcceptSuggestion={handleAcceptSmartSuggestion}
                            />
                        </div>

                        {/* Assignees - Multi-Select */}
                        <div className="grid gap-2">
                            <Label>
                                Assignees <span className="text-destructive ml-1" aria-label="required">*</span>
                            </Label>
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
                                <p id="assignee-error" className="text-sm text-destructive mt-1" role="alert">
                                    {assigneeError}
                                </p>
                            )}
                        </div>

                        {/* Objective - Combobox dropdown */}
                        <div className="grid gap-2">
                            <Label>
                                Objective <span className="text-destructive ml-1" aria-label="required">*</span>
                            </Label>

                            {!hasObjectives ? (
                                <p className="text-sm text-destructive py-2">
                                    No objectives available. Create an objective first.
                                </p>
                            ) : (
                                <Popover open={objectiveOpen} onOpenChange={setObjectiveOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={objectiveOpen}
                                            aria-label="Select an objective"
                                            aria-describedby={objectiveError ? "objective-error" : undefined}
                                            className={cn(
                                                "w-full justify-between text-left font-normal",
                                                !selectedObjective && "text-muted-foreground",
                                                objectiveError && "border-destructive"
                                            )}
                                        >
                                            <span className="flex items-center gap-2 truncate">
                                                <Target className="h-3.5 w-3.5 shrink-0 text-international-orange" />
                                                <span className="truncate">
                                                    {selectedObjective
                                                        ? objectives.find(o => o.id === selectedObjective)?.title
                                                        : "Select an objective..."}
                                                </span>
                                            </span>
                                            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search objectives..." />
                                            <CommandList>
                                                <CommandEmpty>No objectives found.</CommandEmpty>
                                                <CommandGroup>
                                                    {objectives.map((obj) => (
                                                        <CommandItem
                                                            key={obj.id}
                                                            value={obj.title}
                                                            onSelect={() => {
                                                                setSelectedObjective(obj.id)
                                                                setObjectiveError(null)
                                                                setObjectiveOpen(false)
                                                            }}
                                                        >
                                                            <Check className={cn(
                                                                "mr-2 h-3.5 w-3.5",
                                                                selectedObjective === obj.id ? "opacity-100 text-international-orange" : "opacity-0"
                                                            )} />
                                                            <Target className={cn(
                                                                "mr-2 h-3.5 w-3.5 shrink-0",
                                                                selectedObjective === obj.id ? "text-international-orange" : "text-muted-foreground"
                                                            )} />
                                                            <span className="truncate">{obj.title}</span>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            )}

                            {objectiveError && (
                                <p id="objective-error" className="text-sm text-destructive mt-1" role="alert">
                                    {objectiveError}
                                </p>
                            )}
                            <input
                                type="hidden"
                                name="objective_id"
                                value={selectedObjective}
                            />
                        </div>

                        {/* Toggle Button */}
                        <div className="pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-muted-foreground"
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
                                    <Label htmlFor="description">Description <span className="text-muted-foreground font-normal">(Optional)</span></Label>
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
                                    <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
                                </div>

                                {/* Dates - Start & Due side by side */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label>Start Date (Optional)</Label>
                                        <DatePickerWithShortcuts
                                            date={startDate}
                                            onDateChange={setStartDate}
                                            placeholder="Start date"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Due Date (Optional)</Label>
                                        <DatePickerWithShortcuts
                                            date={date}
                                            onDateChange={setDate}
                                            placeholder="Due date"
                                        />
                                    </div>
                                </div>

                                {/* File Attachments */}
                                <div className="grid gap-2">
                                    <Label htmlFor="file-upload">Attachments (Optional)</Label>
                                    <div
                                        className={cn(
                                            "border-2 border-dashed border rounded-lg p-4 text-center cursor-pointer hover:border-slate-300 hover:bg-muted transition-colors",
                                            isDragging && "border-primary bg-primary/10"
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
                                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            Click to upload or drag & drop
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
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
                                                    className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 text-sm"
                                                >
                                                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <span className="truncate flex-1">{file.name}</span>
                                                    <span className="text-xs text-muted-foreground shrink-0">
                                                        {formatFileSize(file.size)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFile(idx)}
                                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                                        aria-label={`Remove ${file.name}`}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Privacy & Sharing */}
                                <PrivacyShareControl
                                    isPrivate={isPrivate}
                                    onPrivateChange={setIsPrivate}
                                    sharedWith={sharedWith}
                                    onSharedWithChange={setSharedWith}
                                    members={members}
                                    teams={teams}
                                    currentUserId={currentUserId}
                                />
                            </>
                        )}
                        {submitError && (
                            <div className="col-span-full">
                                <p className="text-sm text-destructive" role="alert">
                                    {submitError}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setOpenState(false)} disabled={isLoading}>Cancel</Button>
                        <Button
                            type="submit"
                            variant="default"
                            disabled={isLoading || selectedAssignees.length === 0 || !selectedObjective}
                            title={!selectedObjective ? "Please select an objective" : undefined}
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
