'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhoneCall } from 'lucide-react'
import { nudgeTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * ClientNudgeButton - Notifies executives when external clients ask about hidden tasks
 * 
 * @description Part of the Smart Airlock system. When a task is hidden from external
 * clients (client_visible: false), this button lets team members escalate to executives
 * that an external customer is inquiring about the task.
 * 
 * @security Has 1-hour cooldown to prevent spam/abuse
 * @audit Logs "CLIENT NUDGE" events to task history
 * 
 * @example
 * // External client emails asking about hidden task
 * <ClientNudgeButton taskId={task.id} lastNudge={task.last_nudge_at} />
 * // Click → Notifies executives in their channel
 */
interface ClientNudgeButtonProps {
    /** Task ID to nudge about */
    taskId: string
    /** Disable the button entirely */
    disabled?: boolean
    /** Last time this task was nudged (for cooldown enforcement) */
    lastNudge?: string | null
}

export function ClientNudgeButton({ taskId, disabled, lastNudge }: ClientNudgeButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [hasNudged, setHasNudged] = useState(false)

    // Simple client-side cooldown check visual
    const isCoolingDown = lastNudge && (Date.now() - new Date(lastNudge).getTime() < 3600000)

    const handleNudge = async () => {
        setIsLoading(true)
        const result = await nudgeTask(taskId)
        setIsLoading(false)

        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success("Executives notified about external client inquiry")
            setHasNudged(true)
        }
    }

    if (disabled) return null

    return (
        <Button
            variant="secondary"
            size="sm"
            onClick={handleNudge}
            disabled={isLoading || isCoolingDown || hasNudged}
            title={
                isCoolingDown || hasNudged
                    ? "External client update requested (1-hour cooldown)"
                    : "Notify executives that an external client is asking for an update on this hidden task"
            }
            className={cn(
                "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all",
                (isCoolingDown || hasNudged) && "opacity-50 cursor-not-allowed"
            )}
        >
            <PhoneCall className={cn("h-4 w-4", isLoading && "animate-pulse")} />
            {isCoolingDown || hasNudged ? "External Client Notified" : "External Client Asking"}
        </Button>
    )
}
