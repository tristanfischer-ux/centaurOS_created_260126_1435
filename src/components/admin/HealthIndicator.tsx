"use client"

import { cn } from "@/lib/utils"

type HealthStatus = 'healthy' | 'degraded' | 'critical'

interface HealthIndicatorProps {
    status: HealthStatus
    label: string
    message?: string
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

const statusConfig: Record<HealthStatus, { color: string; bgColor: string; label: string }> = {
    healthy: {
        color: 'bg-status-success',
        bgColor: 'bg-status-success/10',
        label: 'Healthy'
    },
    degraded: {
        color: 'bg-status-warning',
        bgColor: 'bg-status-warning/10',
        label: 'Degraded'
    },
    critical: {
        color: 'bg-destructive',
        bgColor: 'bg-destructive/10',
        label: 'Critical'
    }
}

const sizeConfig = {
    sm: {
        dot: 'h-2 w-2',
        text: 'text-xs',
        container: 'gap-1.5'
    },
    md: {
        dot: 'h-3 w-3',
        text: 'text-sm',
        container: 'gap-2'
    },
    lg: {
        dot: 'h-4 w-4',
        text: 'text-base',
        container: 'gap-2.5'
    }
}

export function HealthIndicator({
    status,
    label,
    message,
    size = 'md',
    className
}: HealthIndicatorProps) {
    const statusInfo = statusConfig[status]
    const sizeInfo = sizeConfig[size]
    
    return (
        <div className={cn("flex items-center", sizeInfo.container, className)}>
            <div className={cn("rounded-full", statusInfo.bgColor, "p-1")}>
                <div className={cn("rounded-full", statusInfo.color, sizeInfo.dot, status === 'healthy' && "animate-pulse")} />
            </div>
            <div className="flex flex-col">
                <span className={cn("font-medium text-foreground", sizeInfo.text)}>
                    {label}
                </span>
                {message && (
                    <span className="text-xs text-muted-foreground">
                        {message}
                    </span>
                )}
            </div>
        </div>
    )
}

/**
 * Compact version for inline use
 */
export function HealthDot({
    status,
    className
}: {
    status: HealthStatus
    className?: string
}) {
    const statusInfo = statusConfig[status]
    
    return (
        <span
            className={cn("inline-block h-2 w-2 rounded-full", statusInfo.color, className)}
            title={statusInfo.label}
        />
    )
}
