'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { TextareaWithSpeech } from '@/components/ui/textarea-with-speech'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { getStatusBadgeClass } from '@/lib/status-colors'
import { completeTask, getTaskComments, addTaskComment, getSubtasks, createSubtask, toggleSubtaskComplete, updateTaskAssignees } from '@/actions/tasks'
import { delegateTaskToSpecialist, approveDelegation, rejectDelegation } from '@/actions/task-delegation'
import { getArtifact } from '@/actions/agent-artifacts'
import { toast } from 'sonner'
import { useCelebration } from '@/hooks/useCelebration'
import { formatDistanceToNow } from 'date-fns'
import {
  X, Calendar, Clock, User, Target, FileText, AlertTriangle,
  MessageSquare, Paperclip, Shield, Eye, Pencil, Waypoints, ChevronRight,
  Sparkles, Send, Loader2, Flame, ListChecks, Plus, CheckCircle2,
} from 'lucide-react'
import { formatDuration } from '@/lib/format-duration'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { useRelevantSpecialist, getRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import type { SpecialistContext } from '@/components/specialists/types'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Markdown } from '@/components/ui/markdown'
import type { TaskWithData } from './types'

/** Shape of a task comment from getTaskComments */
interface TaskComment {
  id: string
  content: string
  is_system_log: boolean
  created_at: string
  user_id: string | null
  user?: { full_name: string | null; role: string | null }
}

/** Status options a user can move a task to */
const STATUS_OPTIONS = [
  { value: 'Pending', label: 'Pending' },
  { value: 'Accepted', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' },
] as const

interface TaskDetailPanelProps {
  task: TaskWithData
  onClose: () => void
  /** Callback to open the edit dialog for this task */
  onEdit?: (task: TaskWithData) => void
  /** Team members for the assignee dropdown */
  members?: { id: string; full_name: string; role: string | null }[]
}

/** Self-loading time display for a specific task. */
function TimeLoggedRow({ taskId }: { taskId: string }) {
  const [data, setData] = useState<{ totalMinutes: number; entryCount: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    import('@/actions/time-tracking').then(({ getTimeForTask }) =>
      getTimeForTask(taskId).then((result) => {
        if (!cancelled && !('error' in result)) setData(result)
      })
    ).catch((err) => console.warn('[TASKS] Time fetch failed:', err))
    return () => { cancelled = true }
  }, [taskId])

  const [timerStarting, setTimerStarting] = useState(false)

  const handleStartTimer = async () => {
    setTimerStarting(true)
    try {
      const { startTimer } = await import('@/actions/time-tracking')
      const result = await startTimer(taskId)
      if ('error' in result) {
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to start timer')
      } else {
        toast.success('Timer started')
        window.dispatchEvent(new Event('timer-started'))
      }
    } catch {
      toast.error('Failed to start timer')
    } finally {
      setTimerStarting(false)
    }
  }

  return (
    <DetailRow icon={Clock} label="Time Logged">
      <div className="flex items-center gap-2">
        {data && data.entryCount > 0 ? (
          <span>
            {formatDuration(Math.max(data.totalMinutes, 0))}
            <span className="text-muted-foreground ml-1">
              ({data.entryCount} {data.entryCount === 1 ? 'entry' : 'entries'})
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <button
          onClick={handleStartTimer}
          disabled={timerStarting}
          className="text-[10px] font-medium text-international-orange hover:underline disabled:opacity-50 min-h-[44px] sm:min-h-0 py-1"
        >
          {timerStarting ? 'Starting…' : 'Start Timer'}
        </button>
      </div>
    </DetailRow>
  )
}

function DetailRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </div>
        <div className="text-sm text-foreground break-words">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Detect raw code/data in artifact content and wrap in a fenced code block
 * so the Markdown renderer displays it properly instead of stripping tags.
 */
function formatArtifactContent(content: string): string {
  const trimmed = content.trimStart()
  // JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return '```json\n' + content + '\n```'
  }
  // XML / HTML (sitemaps, SVGs, etc.)
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<!DOCTYPE') || (trimmed.startsWith('<') && trimmed.includes('</') && !trimmed.startsWith('<http'))) {
    return '```xml\n' + content + '\n```'
  }
  return content
}

export function TaskDetailPanel({ task, onClose, onEdit, members = [] }: TaskDetailPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { celebrateTaskComplete } = useCelebration()
  const isOverdue = task.end_date && task.status !== 'Completed' && task.status !== 'Rejected' && new Date(task.end_date) < new Date()
  const statusBadge = getStatusBadgeClass(task.status)

  // Auto-suggest relevant specialist based on task + objective + strategy context
  const { specialistId, specialistName } = useRelevantSpecialist(
    task.title,
    task.description,
    task.strategy?.title ?? task.objective?.title,
  )

  // Subtasks state and fetch
  interface Subtask {
    id: string
    title: string
    status: string
    assignee_id: string | null
    end_date: string | null
    assignee: { id: string; full_name: string | null; role: string | null } | null
  }
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [isLoadingSubtasks, setIsLoadingSubtasks] = useState(true)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false)

  // ── Delegation state ──────────────────────────────────────────────
  const [isDelegating, setIsDelegating] = useState(false)
  const [delegationArtifact, setDelegationArtifact] = useState<{ id: string; content: string; specialistName: string } | null>(null)
  const [revisionFeedback, setRevisionFeedback] = useState('')
  const [showRevisionInput, setShowRevisionInput] = useState(false)
  const taskMetadata = task.metadata as Record<string, unknown> | null

  // Load existing delegation artifact if task already has one
  useEffect(() => {
    const artifactId = taskMetadata?.delegation_artifact_id as string | undefined
    if (artifactId && !delegationArtifact) {
      getArtifact(artifactId).then(({ data }) => {
        if (data) {
          setDelegationArtifact({
            id: data.id,
            content: data.content,
            specialistName: (data.metadata as Record<string, unknown>)?.specialistName as string || 'Specialist',
          })
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskMetadata?.delegation_artifact_id])

  const handleDelegate = async () => {
    setIsDelegating(true)
    try {
      // DECISION: Use API route with maxDuration=300 instead of server action
      // (60s timeout). Opus delegation takes 60-150s.
      const res = await fetch('/api/delegate-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          taskId: task.id,
          ...(revisionFeedback ? { feedback: revisionFeedback } : {}),
        }),
      })
      const result = await res.json()
      setIsDelegating(false)

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (result.artifactId) {
        const { data } = await getArtifact(result.artifactId)
        if (data) {
          setDelegationArtifact({
            id: data.id,
            content: data.content,
            specialistName: result.specialistName || 'Specialist',
          })
          setShowRevisionInput(false)
          setRevisionFeedback('')
          toast.success(`${result.specialistName} has completed the task — review below`)
          router.refresh()
        }
      }
    } catch {
      setIsDelegating(false)
      toast.error('Delegation failed — try again')
    }
  }

  const handleApprove = async () => {
    startTransition(async () => {
      const result = await approveDelegation(task.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        celebrateTaskComplete(task.title)
        toast.success('Task approved and completed')
        router.refresh()
      }
    })
  }

  const handleReject = async () => {
    startTransition(async () => {
      const result = await rejectDelegation(task.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        setDelegationArtifact(null)
        toast.success('Deliverable rejected — task returned to Pending')
        router.refresh()
      }
    })
  }

  useEffect(() => {
    const fetchSubtasks = async () => {
      if (!task.id) return
      setIsLoadingSubtasks(true)
      const res = await getSubtasks(task.id)
      if (res.data) {
        setSubtasks(res.data as Subtask[])
      }
      setIsLoadingSubtasks(false)
    }
    fetchSubtasks()
  }, [task.id])

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtaskTitle.trim()) return
    setIsCreatingSubtask(true)
    try {
      const result = await createSubtask(task.id, newSubtaskTitle)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else if (result.data) {
        setSubtasks(prev => [...prev, result.data as Subtask])
        setNewSubtaskTitle('')
      }
    } finally {
      setIsCreatingSubtask(false)
    }
  }

  const handleToggleSubtask = async (subtaskId: string) => {
    // Optimistic update
    setSubtasks(prev => prev.map(s =>
      s.id === subtaskId ? { ...s, status: s.status === 'Completed' ? 'Pending' : 'Completed' } : s
    ))
    const result = await toggleSubtaskComplete(subtaskId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      // Revert on error
      const res = await getSubtasks(task.id)
      if (res.data) setSubtasks(res.data as Subtask[])
    }
  }

  const handleCompleteParent = () => {
    startTransition(async () => {
      const result = await completeTask(task.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        celebrateTaskComplete(task.title)
        router.refresh()
      }
    })
  }

  const subtaskCompleted = subtasks.filter(s => s.status === 'Completed').length
  const subtaskTotal = subtasks.length
  const allSubtasksDone = subtaskTotal > 0 && subtaskCompleted === subtaskTotal

  // Discussion: comments state and fetch
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isLoadingComments, setIsLoadingComments] = useState(true)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    const fetchComments = async () => {
      if (!task.id) return
      setIsLoadingComments(true)
      const res = await getTaskComments(task.id)
      if (res.error) {
        console.error('[TaskDetailPanel] Failed to fetch comments:', res.error)
        setComments([])
      } else if (res.data) {
        setComments(res.data as TaskComment[])
      }
      setIsLoadingComments(false)
    }
    fetchComments()
  }, [task.id])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setIsSending(true)
    try {
      const result = await addTaskComment(task.id, newComment)
      if (result?.error) {
        toast.error(result.error)
      } else {
        setNewComment('')
        const res = await getTaskComments(task.id)
        if (res.data) setComments(res.data as TaskComment[])
        toast.success('Note added')
      }
    } finally {
      setIsSending(false)
    }
  }

  const humanNotes = comments.filter((c) => !c.is_system_log).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const taskContext: SpecialistContext = {
    type: 'task',
    title: task.title,
    description: task.description ?? undefined,
    metadata: {
      status: task.status,
      riskLevel: task.risk_level ?? undefined,
      pillarTitle: task.strategy?.title,
      notes: [
        task.objective ? `Part of objective: ${task.objective.title}` : null,
        task.end_date ? `Due: ${new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : null,
        isOverdue ? 'OVERDUE' : null,
      ].filter(Boolean).join('. '),
    },
  }

  /**
   * @description Handle inline status change from the detail panel.
   * Uses completeTask server action to properly transition status.
   */
  const handleStatusChange = (newStatus: string): void => {
    if (newStatus === task.status) return

    startTransition(async () => {
      if (newStatus === 'Completed') {
        const result = await completeTask(task.id)
        if (result.error) {
          toast.error(result.error)
        } else {
          celebrateTaskComplete(task.title)
          router.refresh()
        }
        return
      }

      // For non-completion transitions, update status directly via server action
      const { updateTaskStatus } = await import('@/actions/tasks')
      const result = await updateTaskStatus(task.id, newStatus)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Status changed to ${newStatus.replace(/_/g, ' ')}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="h-full flex flex-col bg-background border-l border overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-[10px]', statusBadge)}>
              {task.status.replace(/_/g, ' ')}
            </Badge>
            {task.risk_level && task.risk_level !== 'Low' && (
              <Badge variant="outline" className={cn(
                'text-[10px]',
                task.risk_level === 'High' ? 'border-status-error/30 text-status-error' : 'border-status-warning/30 text-status-warning'
              )}>
                {task.risk_level} Risk
              </Badge>
            )}
            {task.task_number && (
              <span className="text-[10px] font-mono text-muted-foreground">
                #{task.task_number}
              </span>
            )}
          </div>
          {/* Strategic cascade breadcrumb: Strategy > Objective > Task */}
          {(task.strategy || task.objective) && (
            <nav aria-label="Strategic context" className="flex items-center gap-1 text-[11px] text-muted-foreground flex-wrap">
              {task.strategy && (
                <>
                  <Waypoints className="h-3 w-3 text-international-orange flex-shrink-0" />
                  <Link
                    href="/strategy"
                    className="font-medium text-international-orange hover:underline truncate max-w-[180px] inline-block"
                    title={task.strategy.title}
                  >
                    {task.strategy.title}
                  </Link>
                </>
              )}
              {task.strategy && task.objective && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
              )}
              {task.objective && (
                <>
                  <Target className="h-3 w-3 flex-shrink-0" />
                  <Link
                    href={`/new-objectives?selected=${task.objective.id}`}
                    className="hover:underline truncate max-w-[180px] inline-block"
                    title={task.objective.title}
                  >
                    {task.objective.title}
                  </Link>
                </>
              )}
            </nav>
          )}
          <h2 className="text-base font-semibold text-foreground leading-snug break-words">
            {task.title}
          </h2>
          {task.metadata?.source_thread_id && (
            <Link
              href={`/the-forge?thread=${task.metadata.source_thread_id}`}
              className="inline-flex items-center gap-1 text-[11px] text-international-orange hover:underline mt-0.5"
            >
              <Flame className="h-3 w-3" />
              Created from Forge
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={() => onEdit(task)} className="h-8 w-8" aria-label="Edit task">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 w-full overflow-hidden [&>[data-radix-scroll-area-viewport]]:!overflow-x-hidden">
        <div className="p-5 space-y-4 min-w-0 w-full overflow-hidden">
          {/* Description */}
          {task.description && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5" />
                Description
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                {task.description}
              </p>
            </div>
          )}

          {/* Subtasks / Checklist */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <ListChecks className="h-3.5 w-3.5" />
                Subtasks
                {subtaskTotal > 0 && (
                  <span className="text-foreground font-semibold normal-case tracking-normal">
                    {subtaskCompleted} of {subtaskTotal} complete
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {subtaskTotal > 0 && (
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-300"
                  style={{ width: `${Math.round((subtaskCompleted / subtaskTotal) * 100)}%` }}
                />
              </div>
            )}

            {/* Subtask list */}
            {isLoadingSubtasks ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {subtasks.map(subtask => {
                  const isComplete = subtask.status === 'Completed'
                  return (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors group"
                    >
                      <Checkbox
                        checked={isComplete}
                        onCheckedChange={() => handleToggleSubtask(subtask.id)}
                        aria-label={`Mark "${subtask.title}" as ${isComplete ? 'incomplete' : 'complete'}`}
                      />
                      <Link
                        href={`/new-tasks?taskId=${subtask.id}`}
                        className={cn(
                          'flex-1 text-sm',
                          isComplete
                            ? 'line-through text-muted-foreground'
                            : 'text-foreground hover:underline'
                        )}
                      >
                        {subtask.title}
                      </Link>
                      {subtask.assignee?.full_name && (
                        <UserAvatar name={subtask.assignee.full_name} role={subtask.assignee.role} size="xs" />
                      )}
                      {subtask.end_date && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {new Date(subtask.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* All done prompt */}
            {allSubtasksDone && task.status !== 'Completed' && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-success/10 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span className="text-foreground">All subtasks done!</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs text-success hover:text-success"
                  onClick={handleCompleteParent}
                  disabled={isPending}
                >
                  Mark parent as complete?
                </Button>
              </div>
            )}

            {/* Inline add subtask */}
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                placeholder="Add a subtask..."
                disabled={isCreatingSubtask}
                className="flex-1 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 py-1"
              />
              {isCreatingSubtask && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </form>
          </div>

          <Separator />

          {/* Metadata */}
          <div className="space-y-1">
            {/* Status (editable) */}
            <div className="flex items-start gap-3 py-2">
              <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                  Status
                </div>
                <Select
                  value={task.status}
                  onValueChange={handleStatusChange}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-8 text-sm w-full max-w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Assignee + Auto-assign to AI */}
            <div className="flex items-start gap-3 py-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                  Assignee
                </div>
                <div className="space-y-2">
                  {/* AI delegated indicator */}
                  {taskMetadata && taskMetadata.delegated_to ? (
                    <span className="inline-flex items-center gap-1.5 text-sm max-w-full">
                      <UserAvatar name={delegationArtifact?.specialistName || String(taskMetadata.delegated_to)} role="AI_Agent" size="xs" />
                      <span className="font-medium truncate">{delegationArtifact?.specialistName || String(taskMetadata.delegated_to)}</span>
                      <Badge variant="secondary" className="text-[9px] shrink-0">AI</Badge>
                    </span>
                  ) : null}
                  {/* Human assignee dropdown */}
                  <Select
                    value={task.assignee_id || 'unassigned'}
                    onValueChange={async (value) => {
                      const newAssigneeId = value === 'unassigned' ? null : value
                      const assigneeIds = newAssigneeId ? [newAssigneeId] : []
                      const result = await updateTaskAssignees(task.id, assigneeIds)
                      if (result.error) {
                        toast.error(result.error)
                      } else {
                        toast.success('Assignee updated')
                        router.refresh()
                      }
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 text-sm w-full max-w-[220px]">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Auto-assign: picks the most relevant specialist automatically */}
                  {task.status !== 'Completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-international-orange hover:text-international-orange/80 px-0"
                      disabled={isPending}
                      onClick={async () => {
                        const routed = getRelevantSpecialist(task.title, task.description, task.strategy?.title)
                        toast.success(`Assigning to ${routed.specialistName}...`)
                        try {
                          // DECISION: Use API route instead of server action — Opus takes
                          // 60-150s which exceeds the 60s server action timeout on Vercel.
                          // The API route has maxDuration=300.
                          const res = await fetch('/api/delegate-single', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ taskId: task.id }),
                          })
                          const result = await res.json()
                          if (result.error) {
                            toast.error(result.error)
                          } else {
                            toast.success(`${result.specialistName || routed.specialistName} completed — review the deliverable below`)
                            router.refresh()
                          }
                        } catch {
                          toast.error('Delegation failed — try again')
                        }
                      }}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {isPending ? 'Assigning...' : 'Auto-assign AI'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Creator */}
            {task.creator?.full_name && (
              <DetailRow icon={User} label="Created by">
                {task.creator.full_name}
              </DetailRow>
            )}

            {/* Objective */}
            {task.objective && (
              <DetailRow icon={Target} label="Objective">
                {task.objective.title}
              </DetailRow>
            )}

            {/* Due date */}
            {task.end_date && (
              <DetailRow icon={Calendar} label="Due Date">
                <span className={cn(isOverdue && 'text-status-error font-medium')}>
                  {isOverdue && (
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  )}
                  {new Date(task.end_date).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {isOverdue && ' (Overdue)'}
                </span>
              </DetailRow>
            )}

            {/* Start date */}
            {task.start_date && (
              <DetailRow icon={Clock} label="Start Date">
                {new Date(task.start_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </DetailRow>
            )}

            {/* Risk level */}
            {task.risk_level && (
              <DetailRow icon={Shield} label="Risk Level">
                <Badge variant="outline" className={cn(
                  'text-[10px]',
                  task.risk_level === 'High'
                    ? 'border-status-error/30 text-status-error'
                    : task.risk_level === 'Medium'
                    ? 'border-status-warning/30 text-status-warning'
                    : 'border-muted-foreground/30 text-muted-foreground'
                )}>
                  {task.risk_level}
                </Badge>
              </DetailRow>
            )}

            {/* Visibility */}
            {task.client_visible && (
              <DetailRow icon={Eye} label="Visibility">
                <Badge variant="outline" className="text-[10px] border-status-info/30 text-status-info">
                  Client Visible
                </Badge>
              </DetailRow>
            )}

            {/* Time logged */}
            <TimeLoggedRow taskId={task.id} />
          </div>

          {/* Specialist Input Section */}
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Get Specialist Input
            </div>
            <div className="flex items-center gap-2">
              <AskSpecialistButton
                context={taskContext}
                specialistId={specialistId}
                specialistName={specialistName}
                variant="chip"
              />
              <AskSpecialistButton
                context={taskContext}
                variant="chip"
                label="Choose Specialist"
              />
            </div>
          </div>

          {/* ── Deliverable Review (shown only when a delegation artifact exists) ── */}
          {delegationArtifact && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <Flame className="h-3.5 w-3.5" />
                  Deliverable Review
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-international-orange/20 bg-international-orange/5 p-3 overflow-hidden">
                    <p className="text-xs font-medium text-international-orange mb-1">
                      {delegationArtifact.specialistName} completed this task
                    </p>
                    <div className="max-h-[400px] overflow-y-auto overflow-x-auto w-full min-w-0">
                      <Markdown
                        content={formatArtifactContent(delegationArtifact.content)}
                        className="text-sm break-words overflow-hidden [&_*]:max-w-full [&_p]:overflow-hidden [&_p]:text-ellipsis [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all [&_table]:text-xs [&_table]:w-full [&_h1]:overflow-hidden [&_h2]:overflow-hidden [&_h3]:overflow-hidden"
                      />
                    </div>
                  </div>

                  {showRevisionInput ? (
                    <div className="space-y-2">
                      <TextareaWithSpeech
                        value={revisionFeedback}
                        onChange={(e) => setRevisionFeedback(e.target.value)}
                        placeholder="What would you like changed?"
                        className="min-h-[60px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleDelegate}
                          disabled={isDelegating || !revisionFeedback.trim()}
                        >
                          {isDelegating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                          Send Revision
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowRevisionInput(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" onClick={handleApprove} disabled={isPending}>
                        {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowRevisionInput(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Revise
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={handleReject} disabled={isPending}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Attachments */}
          {task.task_files.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachments ({task.task_files.length})
                </div>
                <div className="space-y-1">
                  {task.task_files.map(file => (
                    <div key={file.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-sm">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-foreground">{file.file_name}</span>
                      {file.file_size && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {(file.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Discussion */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <MessageSquare className="h-3.5 w-3.5" />
              Discussion ({humanNotes.length})
            </div>

            {isLoadingComments ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : humanNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No notes yet. Add one below.</p>
            ) : (
              <div className="space-y-2">
                {humanNotes.map((comment) => (
                  <div key={comment.id} className="bg-muted/30 rounded-lg p-2.5 border">
                    <div className="flex items-start gap-2">
                      <UserAvatar
                        name={comment.user?.full_name ?? undefined}
                        role={comment.user?.role ?? undefined}
                        size="xs"
                        className="shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {comment.user?.full_name || 'Unknown'}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed break-words whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSend} className="flex flex-col gap-2">
              <TextareaWithSpeech
                enableSpeech
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onSpeechTranscript={(text) => setNewComment((prev) => prev ? prev + " " + text : text)}
                placeholder="Add a note..."
                className="min-h-[72px] text-xs resize-none w-full"
                disabled={isSending}
              />
              <Button type="submit" size="sm" disabled={isSending || !newComment.trim()} className="self-end h-8 gap-1.5" aria-label="Send note">
                {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
            </form>
          </div>

          {/* Rejection reason */}
          {task.status === 'Rejected' && task.rejection_reason && (
            <>
              <Separator />
              <div className="space-y-1.5 bg-status-error/5 rounded-lg p-3 border border-status-error/20">
                <div className="text-[11px] font-medium text-status-error uppercase tracking-wider">
                  Rejection Reason
                </div>
                <p className="text-sm text-foreground">
                  {task.rejection_reason}
                </p>
              </div>
            </>
          )}

          {/* Amendment notes */}
          {task.amendment_notes && (
            <>
              <Separator />
              <div className="space-y-1.5 bg-status-warning/5 rounded-lg p-3 border border-status-warning/20">
                <div className="text-[11px] font-medium text-status-warning uppercase tracking-wider">
                  Amendment Notes
                </div>
                <p className="text-sm text-foreground">
                  {task.amendment_notes}
                </p>
              </div>
            </>
          )}

          {/* Created/Updated timestamps */}
          <Separator />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Created {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span>
              Updated {new Date(task.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
