"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
    className?: string
    size?: 'sm' | 'default' | 'lg' | 'icon'
    variant?: 'default' | 'outline' | 'ghost' | 'link'
    showLabel?: boolean
}

/**
 * Manual refresh button that triggers Next.js router refresh.
 * Shows spinning animation during refresh.
 */
export function RefreshButton({
    className,
    size = 'sm',
    variant = 'outline',
    showLabel = false
}: RefreshButtonProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isAnimating, setIsAnimating] = useState(false)

    const handleRefresh = () => {
        setIsAnimating(true)
        startTransition(() => {
            router.refresh()
        })
        // Animation runs for fixed duration regardless of transition
        setTimeout(() => setIsAnimating(false), 600)
    }

    return (
        <Button
            onClick={handleRefresh}
            disabled={isPending}
            size={size}
            variant={variant}
            className={cn(
                "group",
                className
            )}
            aria-label="Refresh data"
        >
            <RefreshCw
                className={cn(
                    "h-4 w-4 transition-transform",
                    showLabel && "mr-2",
                    (isPending || isAnimating) && "animate-spin"
                )}
            />
            {showLabel && (
                <span className={cn(
                    "transition-opacity",
                    isPending && "opacity-50"
                )}>
                    {isPending ? "Refreshing..." : "Refresh"}
                </span>
            )}
        </Button>
    )
}
