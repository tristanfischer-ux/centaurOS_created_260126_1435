'use client'

/**
 * @file delegation-progress-modal.tsx
 *
 * @description Modal that displays real-time progress during batch task delegation.
 * Connects to the /api/delegate-batch SSE endpoint and streams progress events.
 * Shows each task with its assigned specialist, status icon, and a progress bar.
 *
 * @related
 * - src/app/api/delegate-batch/route.ts — SSE API endpoint
 * - src/app/(platform)/new-tasks/tasks-command-center.tsx — Consumer
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { getSpecialistById } from '@/lib/agents/specialists-config'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskProgress {
  taskId: string
  taskTitle: string
  specialistName: string
  specialistAvatarUrl: string | null
  status: 'pending' | 'in-progress' | 'complete' | 'error'
  error?: string
}

interface DelegationProgressModalProps {
  open: boolean
  taskIds: string[]
  onClose: () => void
  onComplete: () => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DelegationProgressModal({
  open,
  taskIds,
  onClose,
  onComplete,
}: DelegationProgressModalProps) {
  const [tasks, setTasks] = useState<TaskProgress[]>([])
  const [total, setTotal] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startDelegation = useCallback(async () => {
    if (taskIds.length === 0) return

    // Reset state
    setTasks(taskIds.map((id) => ({
      taskId: id,
      taskTitle: 'Loading...',
      specialistName: '',
      specialistAvatarUrl: null,
      status: 'pending',
    })))
    setTotal(taskIds.length)
    setCompleted(0)
    setFailed(0)
    setIsDone(false)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/delegate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskIds }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        console.error('[delegation-modal] Failed to start batch:', response.status)
        setIsDone(true)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'start') {
              setTotal(event.total)
            } else if (event.type === 'progress') {
              // Look up specialist avatar
              const specialist = getSpecialistById(
                // INTENT: We get specialistName from the SSE event. We need to find
                // the specialist config to get the avatar image path.
                findSpecialistIdByName(event.specialistName),
              )
              const avatarUrl = specialist?.avatarImage ?? null

              setTasks((prev) =>
                prev.map((t) =>
                  t.taskId === event.taskId
                    ? {
                        ...t,
                        taskTitle: event.taskTitle,
                        specialistName: event.specialistName,
                        specialistAvatarUrl: avatarUrl,
                        status: event.status,
                        error: event.error,
                      }
                    : t,
                ),
              )

              if (event.status === 'complete') {
                setCompleted((prev) => prev + 1)
              } else if (event.status === 'error') {
                setFailed((prev) => prev + 1)
              }
            } else if (event.type === 'done') {
              setCompleted(event.completed)
              setFailed(event.failed)
              setIsDone(true)
            }
          } catch {
            // GOTCHA: Partial JSON in SSE buffer — skip and continue
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[delegation-modal] SSE error:', err)
      setIsDone(true)
    }
  }, [taskIds])

  // Start delegation when modal opens
  useEffect(() => {
    if (open && taskIds.length > 0) {
      startDelegation()
    }

    return () => {
      abortRef.current?.abort()
    }
  }, [open, taskIds, startDelegation])

  const handleClose = () => {
    abortRef.current?.abort()
    if (isDone) {
      onComplete()
    }
    onClose()
  }

  const progressPercent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent size="md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-international-orange" />
            {isDone
              ? `Delegation Complete`
              : `Delegating ${completed + failed}/${total} tasks...`}
          </DialogTitle>
          <DialogDescription>
            {isDone
              ? `${completed} completed, ${failed} failed. Review the deliverables in each task.`
              : 'Your specialists are working on the tasks. This may take a few minutes.'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {progressPercent}%
          </p>
        </div>

        {/* Task List */}
        <div className="max-h-[320px] overflow-y-auto space-y-2">
          {tasks.map((task) => (
            <div
              key={task.taskId}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors"
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {task.status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                {task.status === 'in-progress' && (
                  <Loader2 className="h-5 w-5 text-international-orange animate-spin" />
                )}
                {task.status === 'complete' && (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                )}
                {task.status === 'error' && (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
              </div>

              {/* Specialist Avatar */}
              {task.specialistAvatarUrl ? (
                <Image
                  src={task.specialistAvatarUrl}
                  alt={task.specialistName}
                  width={28}
                  height={28}
                  className="rounded-full flex-shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {task.specialistName?.charAt(0) || '?'}
                  </span>
                </div>
              )}

              {/* Task Info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{task.taskTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {task.specialistName
                    ? task.status === 'error'
                      ? `${task.specialistName} — ${task.error || 'Failed'}`
                      : task.specialistName
                    : 'Routing to specialist...'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {isDone && (
          <DialogFooter>
            <Button onClick={handleClose}>
              Close & Review Deliverables
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * INTENT: Reverse-lookup specialist ID from display name.
 * Used to resolve avatar images from SSE events that only carry the name.
 */
const SPECIALIST_NAME_MAP: Record<string, string> = {
  Sage: 'strategist',
  Max: 'cto',
  Jian: 'vp-engineering',
  Fang: 'vp-manufacturing',
  Chase: 'vp-supply-chain',
  Priya: 'product-lead',
  Mia: 'growth-marketer',
  Sal: 'sales-lead',
  Cal: 'chief-of-staff',
  Finn: 'finance-lead',
  Fiona: 'fundraising-advisor',
  Harper: 'hiring-team',
  Leo: 'legal-counsel',
}

function findSpecialistIdByName(name: string): string {
  return SPECIALIST_NAME_MAP[name] ?? 'strategist'
}
