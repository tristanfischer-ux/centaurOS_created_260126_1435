'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PhoneCall } from 'lucide-react'
import { nudgeTask } from '@/actions/tasks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ClientNudgeButtonProps {
    taskId: string
    disabled?: boolean
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
            toast.success("Request sent to Executive channel.")
            setHasNudged(true)
        }
    }

    if (disabled) return null

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleNudge}
            disabled={isLoading || isCoolingDown || hasNudged}
            className={cn(
                "border-red-500/30 text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-all",
                (isCoolingDown || hasNudged) && "opacity-50 cursor-not-allowed"
            )}
        >
            <PhoneCall className={cn("h-4 w-4", isLoading && "animate-pulse")} />
            {isCoolingDown || hasNudged ? "Update Requested" : "Request Update"}
        </Button>
    )
}
