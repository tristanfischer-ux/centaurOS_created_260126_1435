"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow, format } from "date-fns"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { MentionInput } from "@/components/ui/mention-input"
import { MentionText } from "@/components/ui/mention-text"
import { AttachmentList } from "@/components/tasks/attachment-list"
import { Markdown } from "@/components/ui/markdown"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { addTaskComment, getTaskComments, getTaskAttachments, getTaskHistory, updateTaskDetails, updateTaskAssignees, updateTaskDates, updateTaskStatusAndRisk, updateTaskPrivacy, getTaskShares } from "@/actions/tasks"
import { uploadTaskAttachment } from "@/actions/attachments"
import { attachDriveFileToTask } from "@/actions/google-drive"
import { DriveFilePicker } from "@/components/ui/drive-file-picker"
import { toast } from "sonner"
import { cn, getInitials } from "@/lib/utils"
import { getStatusColor } from "@/lib/status-colors"
import {
    Loader2,
    Send,
    Upload,
    Calendar,
    User,
    Paperclip,
    MessageSquare,
    History,
    ShieldAlert,
    ShieldCheck,
    Bot,
    Edit2,
    X,
    Check,
    ChevronDown,
    Lock,
    Unlock,
    HardDrive,
} from "lucide-react"
import { PrivacyShareControl, PrivacyBadge, type ShareTarget } from "@/components/ui/privacy-share-control"
import { Database } from "@/types/database.types"
import dynamic from "next/dynamic"
import type { ReviewGate } from "@/types/review-gates"

// Lazy-load review gate components to avoid pulling server action imports
// into the Jest test bundle (next/cache -> Request not defined in Jest)
const ReviewGateBanner = dynamic(
    () => import("@/components/review-gates/ReviewGateBanner").then(m => m.ReviewGateBanner),
    { ssr: false }
)
const AddReviewGateDialog = dynamic(
    () => import("@/components/review-gates/AddReviewGateDialog").then(m => m.AddReviewGateDialog),
    { ssr: false }
)

interface Member {
    id: string
    full_name: string
    role: string
    email: string
}

interface Assignee {
    id: string
    full_name: string | null
    role: string | null
    email: string
    avatar_url?: string | null
}

interface Task {
    id: string
    title: string
    description: string | null
    status: string | null
    risk_level: string | null
    start_date: string | null
    end_date: string | null
    task_number?: number
    assignee?: Assignee | null
    assignees?: Assignee[]
    task_files?: { id: string }[]
    objective?: { id: string; title: string } | null
    is_private?: boolean
    creator_id?: string
}

interface Comment {
    id: string
    content: string
    is_system_log: boolean
    created_at: string
    user_id: string
    user?: { full_name: string; role: string }
}

type TaskHistoryItem = Database['public']['Tables']['task_history']['Row'] & {
    user: {
        full_name: string | null
        role?: string | null
        avatar_url?: string | null
    } | null
}

interface FullTaskViewProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: Task
    members: Member[]
    currentUserId: string
    teams?: { id: string; name: string }[]
}

export function FullTaskView({ open, onOpenChange, task, members, currentUserId, teams = [] }: FullTaskViewProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [history, setHistory] = useState<TaskHistoryItem[]>([])
    const [attachments, setAttachments] = useState<any[]>([])
    const [reviewGates, setReviewGates] = useState<ReviewGate[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [newComment, setNewComment] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false)
    const [isAttachingDriveFile, setIsAttachingDriveFile] = useState(false)
    const [currentStatus, setCurrentStatus] = useState(task.status || "Pending")
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const supabase = useMemo(() => createClient(), [])

    // Sync currentStatus when task prop changes
    useEffect(() => {
        setCurrentStatus(task.status || "Pending")
    }, [task.status])

    // Editing state
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [editedTitle, setEditedTitle] = useState(task.title)
    const [editedDescription, setEditedDescription] = useState(task.description || "")
    const [editedStatus, setEditedStatus] = useState(task.status || "Pending")
    const [editedRiskLevel, setEditedRiskLevel] = useState(task.risk_level || "Low")
    const [editedStartDate, setEditedStartDate] = useState<Date | undefined>(
        task.start_date ? new Date(task.start_date) : undefined
    )
    const [editedEndDate, setEditedEndDate] = useState<Date | undefined>(
        task.end_date ? new Date(task.end_date) : undefined
    )
    const [editedAssigneeIds, setEditedAssigneeIds] = useState<string[]>(
        task.assignees?.map(a => a.id) || (task.assignee ? [task.assignee.id] : [])
    )
    const [editedIsPrivate, setEditedIsPrivate] = useState(task.is_private || false)
    const [editedSharedWith, setEditedSharedWith] = useState<ShareTarget[]>([])
    const isTaskCreator = task.creator_id === currentUserId

    // Get assignees
    const assignees = task.assignees && task.assignees.length > 0
        ? task.assignees
        : (task.assignee ? [task.assignee] : [])

    // Fetch data when dialog opens
    useEffect(() => {
        const fetchAllData = async () => {
            setIsLoading(true)
            
            // Fetch comments using server action for consistent auth
            const commentsRes = await getTaskComments(task.id)
            if (commentsRes.error) {
                console.error('[FullTaskView] Failed to fetch comments:', commentsRes.error)
            } else if (commentsRes.data) {
                setComments(commentsRes.data as Comment[])
            }

            // Fetch attachments
            const attachmentsRes = await getTaskAttachments(task.id)
            if (attachmentsRes.data) {
                setAttachments(attachmentsRes.data)
            }

            // Fetch history
            const historyRes = await getTaskHistory(task.id)
            if (historyRes.data && Array.isArray(historyRes.data)) {
                setHistory(historyRes.data as TaskHistoryItem[])
            }

            // Fetch existing shares for privacy controls
            if (task.is_private) {
                const sharesRes = await getTaskShares(task.id)
                if (sharesRes.data) {
                    setEditedSharedWith(sharesRes.data.map(s => ({ type: s.type, id: s.id })))
                }
            }

            // Fetch review gates (dynamic import to avoid Jest issues)
            const { getReviewGatesForTask } = await import("@/actions/review-gates")
            const gatesRes = await getReviewGatesForTask(task.id)
            if (!gatesRes.error) {
                setReviewGates(gatesRes.data)
            }

            setIsLoading(false)
        }

        if (open && task.id) {
            fetchAllData()
        }
    }, [open, task.id])

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) return

        setIsSending(true)
        try {
            const result = await addTaskComment(task.id, newComment)
            if (result?.error) {
                toast.error(result.error)
            } else {
                setNewComment("")
                // Refresh comments using server action for consistent auth
                const commentsRes = await getTaskComments(task.id)
                if (commentsRes.error) {
                    console.error('[FullTaskView] Failed to refresh comments:', commentsRes.error)
                } else if (commentsRes.data) {
                    setComments(commentsRes.data as Comment[])
                }
                toast.success("Note added")
            }
        } finally {
            setIsSending(false)
        }
    }

    const handleFileUpload = async (file: File) => {
        if (!file) {
            console.error('No file provided to handleFileUpload')
            return
        }

        setIsUploading(true)
        
        try {
            const formData = new FormData()
            formData.append('file', file)

            const result = await uploadTaskAttachment(task.id, formData)
            
            if (result.error) {
                console.error('Upload failed:', result.error)
                toast.error(`Upload failed: ${result.error}`)
            } else {
                toast.success(`Uploaded ${file.name}`)
                
                // Refresh attachments
                const attachmentsRes = await getTaskAttachments(task.id)
                if (attachmentsRes.data) {
                    setAttachments(attachmentsRes.data)
                }
                
                // Refresh comments using server action (system log entry added)
                const commentsRes = await getTaskComments(task.id)
                if (commentsRes.data) {
                    setComments(commentsRes.data as Comment[])
                }
            }
        } catch (error) {
            console.error('Unexpected error during upload:', error)
            toast.error('Unexpected error during upload')
        } finally {
            setIsUploading(false)
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleDriveFileSelect = async (file: { id: string; name: string; mimeType: string; webViewLink: string | null }): Promise<void> => {
        setIsAttachingDriveFile(true)
        try {
            const result = await attachDriveFileToTask(task.id, file.id)
            if (result.error) {
                toast.error(`Failed to attach: ${result.error}`)
            } else {
                toast.success(`Attached ${file.name} from Google Drive`)
                // Refresh attachments
                const attachmentsRes = await getTaskAttachments(task.id)
                if (attachmentsRes.data) {
                    setAttachments(attachmentsRes.data)
                }
            }
        } catch (error) {
            console.error('[FullTaskView] Drive file attachment error:', error)
            toast.error('Failed to attach file from Google Drive')
        } finally {
            setIsAttachingDriveFile(false)
        }
    }

    const handleSaveEdits = async () => {
        setIsSaving(true)
        try {
            // Update basic details (title, description)
            if (editedTitle !== task.title || editedDescription !== task.description) {
                const res = await updateTaskDetails(task.id, {
                    title: editedTitle,
                    description: editedDescription
                })
                if (res.error) {
                    toast.error(res.error)
                    setIsSaving(false)
                    return
                }
            }

            // Update dates
            if (editedStartDate || editedEndDate) {
                const startDateStr = editedStartDate?.toISOString() || task.start_date || new Date().toISOString()
                const endDateStr = editedEndDate?.toISOString() || task.end_date || new Date().toISOString()
                const res = await updateTaskDates(task.id, startDateStr, endDateStr)
                if (res.error) {
                    toast.error(res.error)
                    setIsSaving(false)
                    return
                }
            }

            // Update assignees
            const currentAssigneeIds = task.assignees?.map(a => a.id) || (task.assignee ? [task.assignee.id] : [])
            const assigneesChanged = JSON.stringify(editedAssigneeIds.sort()) !== JSON.stringify(currentAssigneeIds.sort())
            if (assigneesChanged && editedAssigneeIds.length > 0) {
                const res = await updateTaskAssignees(task.id, editedAssigneeIds)
                if (res.error) {
                    toast.error(res.error)
                    setIsSaving(false)
                    return
                }
            }

            // Update status and risk_level directly via Supabase (no dedicated action exists)
            const updates: any = {}
            if (editedStatus !== task.status) updates.status = editedStatus
            if (editedRiskLevel !== task.risk_level) updates.risk_level = editedRiskLevel

            if (Object.keys(updates).length > 0) {
                const { error } = await supabase
                    .from('tasks')
                    .update(updates)
                    .eq('id', task.id)
                
                if (error) {
                    toast.error(error.message)
                    setIsSaving(false)
                    return
                }
            }

            // Update privacy settings (only creator can change)
            if (isTaskCreator && editedIsPrivate !== task.is_private) {
                const res = await updateTaskPrivacy(task.id, editedIsPrivate, editedSharedWith)
                if (res.error) {
                    toast.error(res.error)
                    setIsSaving(false)
                    return
                }
            } else if (isTaskCreator && editedIsPrivate) {
                // Even if privacy didn't change, shares might have
                const res = await updateTaskPrivacy(task.id, editedIsPrivate, editedSharedWith)
                if (res.error) {
                    toast.error(res.error)
                    setIsSaving(false)
                    return
                }
            }

            toast.success("Task updated successfully")
            setIsEditing(false)
            
            // Reload the page to reflect changes
            window.location.reload()
        } catch (error) {
            toast.error("Failed to save changes")
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancelEdits = () => {
        setEditedTitle(task.title)
        setEditedDescription(task.description || "")
        setEditedStatus(task.status || "Pending")
        setEditedRiskLevel(task.risk_level || "Low")
        setEditedStartDate(task.start_date ? new Date(task.start_date) : undefined)
        setEditedEndDate(task.end_date ? new Date(task.end_date) : undefined)
        setEditedAssigneeIds(task.assignees?.map(a => a.id) || (task.assignee ? [task.assignee.id] : []))
        setIsEditing(false)
    }

    /**
     * Quick status change without entering edit mode.
     * Updates the task status directly and refreshes history.
     */
    const handleQuickStatusChange = async (newStatus: string): Promise<void> => {
        if (newStatus === currentStatus) {
            setStatusPopoverOpen(false)
            return
        }

        setIsUpdatingStatus(true)
        setStatusPopoverOpen(false)

        try {
            // Safe cast: newStatus comes from TASK_STATUSES which only has valid enum values
            const { error } = await supabase
                .from('tasks')
                .update({ status: newStatus as Database['public']['Enums']['task_status'] })
                .eq('id', task.id)

            if (error) {
                console.error('[FullTaskView] Failed to update status:', { taskId: task.id, error: error.message })
                toast.error('Failed to update status')
                return
            }

            setCurrentStatus(newStatus)
            setEditedStatus(newStatus)
            toast.success(`Status changed to ${newStatus.replace(/_/g, ' ')}`)

            // Refresh history to show the status change
            const historyRes = await getTaskHistory(task.id)
            if (historyRes.data && Array.isArray(historyRes.data)) {
                setHistory(historyRes.data as TaskHistoryItem[])
            }
        } catch (err) {
            console.error('[FullTaskView] Unexpected error updating status:', err)
            toast.error('Failed to update status')
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    const TASK_STATUSES = [
        { value: 'Pending', label: 'Pending' },
        { value: 'Accepted', label: 'Accepted' },
        { value: 'Pending_Peer_Review', label: 'Peer Review' },
        { value: 'Pending_Executive_Approval', label: 'Executive Approval' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Rejected', label: 'Rejected' },
    ] as const

    const getRiskBadge = (level: string | null) => {
        if (level === 'High') {
            return (
                <Badge variant="destructive" className="gap-1 shadow-sm font-mono tracking-tighter">
                    <ShieldAlert className="w-3 h-3" /> HIGH RISK
                </Badge>
            )
        }
        if (level === 'Medium') {
            return (
                <Badge variant="warning" className="gap-1 shadow-sm font-mono tracking-tighter">
                    <ShieldCheck className="w-3 h-3" /> MEDIUM RISK
                </Badge>
            )
        }
        return (
            <Badge variant="secondary" className="gap-1 text-muted-foreground bg-muted border font-mono tracking-tighter">
                <ShieldCheck className="w-3 h-3" /> LOW RISK
            </Badge>
        )
    }

    const getActionBadge = (actionType: string, changes: any) => {
        switch (actionType) {
            case 'CREATED': return <Badge variant="info">Created</Badge>
            case 'COMPLETED': return <Badge className="bg-foreground text-background">Completed</Badge>
            case 'STATUS_CHANGE':
                if (changes && typeof changes === 'object' && 'new_status' in changes) {
                    const statusColor = getStatusColor(changes.new_status)
                    return <Badge className={statusColor.bar}>{changes.new_status.replace(/_/g, ' ')}</Badge>
                }
                return <Badge variant="secondary">Status Change</Badge>
            case 'ASSIGNED': return <Badge variant="secondary">Assigned</Badge>
            case 'FORWARDED': return <Badge variant="warning">Forwarded</Badge>
            case 'UPDATED': return <Badge variant="secondary">Updated</Badge>
            default: return <Badge variant="secondary">{actionType}</Badge>
        }
    }

    // Separate notes (human comments) from system logs
    const humanNotes = comments.filter(c => !c.is_system_log)
    const systemLogs = comments.filter(c => c.is_system_log)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="lg" className="w-full h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b border shrink-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <div className="space-y-4">
                                    {/* Editable Status and Risk */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-mono text-muted-foreground">
                                            #{task.task_number ?? '...'}
                                        </span>
                                        <Select value={editedStatus} onValueChange={setEditedStatus}>
                                            <SelectTrigger className="w-[180px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Pending">Pending</SelectItem>
                                                <SelectItem value="Accepted">Accepted</SelectItem>
                                                <SelectItem value="In_Progress">In Progress</SelectItem>
                                                <SelectItem value="Pending_Approval">Pending Approval</SelectItem>
                                                <SelectItem value="Completed">Completed</SelectItem>
                                                <SelectItem value="Rejected">Rejected</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select value={editedRiskLevel} onValueChange={setEditedRiskLevel}>
                                            <SelectTrigger className="w-[140px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Low">Low Risk</SelectItem>
                                                <SelectItem value="Medium">Medium Risk</SelectItem>
                                                <SelectItem value="High">High Risk</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {/* Editable Title */}
                                    <Input
                                        value={editedTitle}
                                        onChange={(e) => setEditedTitle(e.target.value)}
                                        className="text-2xl font-display font-semibold h-auto py-2"
                                        placeholder="Task title"
                                    />
                                    {task.objective && (
                                        <p className="text-sm text-primary">
                                            {task.objective.title}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-sm font-mono text-muted-foreground">
                                            #{task.task_number ?? '...'}
                                        </span>
                                        {/* Clickable status badge for quick status changes */}
                                        <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    disabled={isUpdatingStatus}
                                                    className="group/status inline-flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
                                                    aria-label={`Change status from ${currentStatus.replace(/_/g, ' ')}`}
                                                >
                                                    <Badge className={`${getStatusColor(currentStatus).bar} text-white border-0`}>
                                                        {isUpdatingStatus ? (
                                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                        ) : null}
                                                        {currentStatus.replace(/_/g, ' ')}
                                                    </Badge>
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover/status:opacity-100 transition-opacity" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[220px] p-1" align="start">
                                                <div className="space-y-0.5">
                                                    <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">Change status</p>
                                                    {TASK_STATUSES.map((status) => (
                                                        <button
                                                            key={status.value}
                                                            type="button"
                                                            onClick={() => handleQuickStatusChange(status.value)}
                                                            className={cn(
                                                                "flex items-center gap-2 w-full text-left px-2 py-2 rounded-md text-sm transition-colors",
                                                                currentStatus === status.value
                                                                    ? "bg-muted font-medium text-foreground"
                                                                    : "text-foreground hover:bg-muted"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "h-2 w-2 rounded-full shrink-0",
                                                                getStatusColor(status.value).bar
                                                            )} />
                                                            {status.label}
                                                            {currentStatus === status.value && (
                                                                <Check className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        {getRiskBadge(task.risk_level)}
                                    </div>
                                    <DialogTitle className="text-2xl font-display font-semibold text-foreground tracking-tight">
                                        {task.title}
                                    </DialogTitle>
                                    {task.objective && (
                                        <p className="text-sm text-primary mt-1">
                                            {task.objective.title}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Edit/Save/Cancel Buttons */}
                        <div className="flex items-center gap-2">
                            {isEditing ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCancelEdits}
                                        disabled={isSaving}
                                    >
                                        <X className="h-4 w-4 mr-1" />
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handleSaveEdits}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        ) : (
                                            <Check className="h-4 w-4 mr-1" />
                                        )}
                                        Save
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <Edit2 className="h-4 w-4 mr-1" />
                                    Edit
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Main Content - Scrollable */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        {/* Review Gates Section */}
                        {(reviewGates.length > 0 || !isLoading) && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    {reviewGates.length > 0 && (
                                        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-status-info" /> Review Gates
                                        </h3>
                                    )}
                                    <AddReviewGateDialog
                                        taskId={task.id}
                                        teamMembers={members.map(m => ({ id: m.id, full_name: m.full_name, role: m.role }))}
                                        onCreated={async () => {
                                            const { getReviewGatesForTask } = await import("@/actions/review-gates")
                                            const res = await getReviewGatesForTask(task.id)
                                            if (!res.error) setReviewGates(res.data)
                                        }}
                                    />
                                </div>
                                <ReviewGateBanner
                                    gates={reviewGates}
                                    currentUserId={currentUserId}
                                    onUpdate={async () => {
                                        const { getReviewGatesForTask } = await import("@/actions/review-gates")
                                        const res = await getReviewGatesForTask(task.id)
                                        if (!res.error) setReviewGates(res.data)
                                    }}
                                />
                            </div>
                        )}

                        {/* Top Section: Description + Details */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Description */}
                            <div className="lg:col-span-2 space-y-2">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" /> Description
                                </h3>
                                {isEditing ? (
                                    <Textarea
                                        value={editedDescription}
                                        onChange={(e) => setEditedDescription(e.target.value)}
                                        className="min-h-[150px] bg-muted"
                                        placeholder="Add a description..."
                                    />
                                ) : (
                                    <div className="bg-muted rounded-lg p-4 min-h-[100px]">
                                        {task.description ? (
                                            <Markdown content={task.description} className="text-sm text-foreground leading-relaxed" />
                                        ) : (
                                            <p className="text-sm text-muted-foreground italic">No description provided.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Details */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Details</h3>
                                <div className="bg-muted rounded-lg p-4 space-y-3">
                                    {isEditing ? (
                                        <>
                                            {/* Editable Start Date */}
                                            <div className="space-y-2">
                                                <Label className="text-sm text-muted-foreground">Start Date</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {editedStartDate ? format(editedStartDate, "MMM d, yyyy") : "Pick a date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={editedStartDate}
                                                            onSelect={setEditedStartDate}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            {/* Editable End Date */}
                                            <div className="space-y-2">
                                                <Label className="text-sm text-muted-foreground">Due Date</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <Calendar className="mr-2 h-4 w-4" />
                                                            {editedEndDate ? format(editedEndDate, "MMM d, yyyy") : "Pick a date"}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <CalendarComponent
                                                            mode="single"
                                                            selected={editedEndDate}
                                                            onSelect={setEditedEndDate}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            <Separator className="my-2" />
                                            {/* Editable Assignees */}
                                            <div className="space-y-2">
                                                <Label className="text-sm text-muted-foreground">Assignees</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                            <User className="mr-2 h-4 w-4" />
                                                            {editedAssigneeIds.length > 0 
                                                                ? `${editedAssigneeIds.length} selected`
                                                                : "Select assignees"
                                                            }
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[250px] p-0" align="start">
                                                        <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                                                            {members.map((member) => (
                                                                <div
                                                                    key={member.id}
                                                                    className={cn(
                                                                        "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted",
                                                                        editedAssigneeIds.includes(member.id) && "bg-muted"
                                                                    )}
                                                                    onClick={() => {
                                                                        if (editedAssigneeIds.includes(member.id)) {
                                                                            setEditedAssigneeIds(editedAssigneeIds.filter(id => id !== member.id))
                                                                        } else {
                                                                            setEditedAssigneeIds([...editedAssigneeIds, member.id])
                                                                        }
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={editedAssigneeIds.includes(member.id)}
                                                                        onChange={() => {}}
                                                                        className="h-4 w-4"
                                                                    />
                                                                    <UserAvatar 
                                                                        name={member.full_name} 
                                                                        role={member.role} 
                                                                        size="sm" 
                                                                    />
                                                                    <span className="text-sm">{member.full_name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                            {/* Privacy & Sharing (only for task creator) */}
                                            {isTaskCreator && (
                                                <>
                                                    <Separator className="my-2" />
                                                    <PrivacyShareControl
                                                        isPrivate={editedIsPrivate}
                                                        onPrivateChange={setEditedIsPrivate}
                                                        sharedWith={editedSharedWith}
                                                        onSharedWithChange={setEditedSharedWith}
                                                        members={members}
                                                        teams={teams}
                                                        currentUserId={currentUserId}
                                                    />
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {/* Privacy indicator (view mode) */}
                                            {task.is_private && (
                                                <div className="flex items-center gap-2 text-sm mb-2">
                                                    <Lock className="h-4 w-4 text-status-warning" />
                                                    <span className="text-status-warning-dark font-medium">Private</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">Start:</span>
                                                <span className="font-medium">
                                                    {task.start_date ? format(new Date(task.start_date), "MMM d, yyyy") : "Not set"}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-muted-foreground">Due:</span>
                                                <span className={cn(
                                                    "font-medium",
                                                    task.end_date && new Date(task.end_date) < new Date() && task.status !== 'Completed' && "text-destructive"
                                                )}>
                                                    {task.end_date ? format(new Date(task.end_date), "MMM d, yyyy") : "Not set"}
                                                </span>
                                            </div>
                                            <Separator className="my-2" />
                                            <div className="flex items-start gap-2 text-sm">
                                                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                                                <div>
                                                    <span className="text-muted-foreground block mb-1">Assignee:</span>
                                                    {assignees.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {assignees.map(a => (
                                                                <div key={a.id} className="flex items-center gap-2">
                                                                    <UserAvatar 
                                                                        name={a.full_name} 
                                                                        role={a.role}
                                                                        avatarUrl={a.avatar_url}
                                                                        size="sm" 
                                                                    />
                                                                    <span className="font-medium">{a.full_name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="font-medium text-muted-foreground italic">Unassigned</span>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Attachments Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <Paperclip className="h-4 w-4" /> Attachments
                                <Badge variant="secondary" className="text-xs">{attachments.length}</Badge>
                            </h3>
                            
                            {/* Upload Area */}
                            <div
                                className={cn(
                                    "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                                    isUploading 
                                        ? "border-primary bg-primary/10 cursor-wait pointer-events-none" 
                                        : isDragging 
                                        ? "border-primary bg-primary/10" 
                                        : "border-muted-foreground/30 hover:border-primary cursor-pointer bg-muted/30 hover:bg-muted/50"
                                )}
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!isUploading && fileInputRef.current) {
                                        fileInputRef.current.click()
                                    }
                                }}
                                onDragOver={(e) => { 
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (!isUploading) setIsDragging(true) 
                                }}
                                onDragLeave={(e) => { 
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setIsDragging(false) 
                                }}
                                onDrop={async (e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setIsDragging(false)
                                    if (isUploading) return
                                    const files = Array.from(e.dataTransfer.files)
                                    if (files.length > 0) {
                                        await handleFileUpload(files[0])
                                    }
                                }}
                            >
                                {isUploading ? (
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                        <span className="text-sm text-primary font-medium">Uploading...</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <Upload className="h-8 w-8 text-muted-foreground" />
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-foreground">Click to upload or drag and drop</span>
                                            <span className="text-xs text-muted-foreground">Any file type supported</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Google Drive Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full border border-dashed border-muted-foreground/30 hover:border-primary"
                                onClick={() => setIsDrivePickerOpen(true)}
                                disabled={isAttachingDriveFile}
                            >
                                {isAttachingDriveFile ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <HardDrive className="h-4 w-4 mr-2" />
                                )}
                                {isAttachingDriveFile ? 'Attaching...' : 'Attach from Google Drive'}
                            </Button>
                            <DriveFilePicker
                                open={isDrivePickerOpen}
                                onOpenChange={setIsDrivePickerOpen}
                                onSelect={handleDriveFileSelect}
                            />
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={async (e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const file = e.target.files?.[0]
                                    if (file && !isUploading) {
                                        await handleFileUpload(file)
                                    }
                                }}
                                disabled={isUploading}
                                className="hidden"
                                aria-label="Upload file"
                            />

                            {/* Attachments List */}
                            {attachments.length > 0 && (
                                <div className="bg-muted rounded-lg p-4">
                                    <AttachmentList
                                        taskId={task.id}
                                        attachments={attachments}
                                        canDelete={true}
                                        onDelete={(id) => setAttachments(prev => prev.filter(f => f.id !== id))}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Add Note Section */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Add Note
                            </h3>
                            <form onSubmit={handleSend} className="flex items-start gap-3">
                                <div className="flex-1">
                                    <MentionInput
                                        value={newComment}
                                        onChange={setNewComment}
                                        members={members}
                                        placeholder="Add a note... Use @ to mention someone"
                                        onSubmit={() => {
                                            if (newComment.trim()) {
                                                handleSend({ preventDefault: () => {} } as React.FormEvent)
                                            }
                                        }}
                                        className="text-sm min-h-[100px] resize-none"
                                    />
                                </div>
                                <Button type="submit" disabled={isSending || !newComment.trim()} className="shrink-0">
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                    Send
                                </Button>
                            </form>
                        </div>

                        {/* Discussion Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Discussion
                                <Badge variant="secondary" className="text-xs">{humanNotes.length} notes</Badge>
                            </h3>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                                </div>
                            ) : humanNotes.length === 0 ? (
                                <div className="bg-muted rounded-lg p-8 text-center">
                                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-muted-foreground">No notes yet. Be the first to add one!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {humanNotes.map((comment) => (
                                        <div key={comment.id} className="bg-background border rounded-lg p-4">
                                            <div className="flex items-start gap-3">
                                                <UserAvatar 
                                                    name={comment.user?.full_name} 
                                                    role={comment.user?.role}
                                                    size="md" 
                                                    className="shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-foreground">
                                                            {comment.user?.full_name || 'Unknown'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-foreground">
                                                        <MentionText 
                                                            content={comment.content} 
                                                            members={members.map(m => ({
                                                                id: m.id,
                                                                full_name: m.full_name
                                                            }))}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Activity Log Section */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                                <History className="h-4 w-4" /> Activity Log
                                <Badge variant="secondary" className="text-xs">{history.length + systemLogs.length}</Badge>
                            </h3>

                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                                </div>
                            ) : (history.length === 0 && systemLogs.length === 0) ? (
                                <div className="bg-muted rounded-lg p-8 text-center">
                                    <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-muted-foreground">No activity logged yet.</p>
                                </div>
                            ) : (
                                <div className="bg-muted rounded-lg p-4">
                                    <div className="relative border-l-2 border ml-2 space-y-3">
                                        {/* Combine and sort history and system logs by date */}
                                        {[
                                            ...history.map(h => ({ type: 'history' as const, item: h, date: new Date(h.created_at || 0) })),
                                            ...systemLogs.map(s => ({ type: 'log' as const, item: s, date: new Date(s.created_at) }))
                                        ]
                                            .sort((a, b) => b.date.getTime() - a.date.getTime())
                                            .slice(0, 20)
                                            .map((entry, i) => (
                                                <div key={`${entry.type}-${entry.type === 'history' ? entry.item.id : entry.item.id}`} className="relative pl-6">
                                                    <div className={cn(
                                                        "absolute -left-[5px] top-1.5 h-2 w-2 rounded-full",
                                                        entry.type === 'history' ? "bg-muted-foreground" : "bg-primary"
                                                    )} />
                                                    {entry.type === 'history' ? (
                                                        <div className="flex items-center gap-2 flex-wrap text-sm">
                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                {format(entry.date, 'MMM d, HH:mm')}
                                                            </span>
                                                            {getActionBadge((entry.item as TaskHistoryItem).action_type, (entry.item as TaskHistoryItem).changes)}
                                                            <span className="text-xs text-muted-foreground">
                                                                by {(entry.item as TaskHistoryItem).user?.full_name || 'Unknown'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className="text-xs font-mono text-muted-foreground">
                                                                    {format(entry.date, 'MMM d, HH:mm')}
                                                                </span>
                                                                <Badge variant="secondary">System</Badge>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {(entry.item as Comment).content}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
