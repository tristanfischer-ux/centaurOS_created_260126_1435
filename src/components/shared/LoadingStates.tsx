'use client'

import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading State Guidelines:
 * 
 * 1. PAGE LEVEL - Use Skeleton components
 *    - Create a loading.tsx file in your route folder
 *    - Match the skeleton layout to the actual page layout
 *    - Include all major sections as skeletons
 *    - Example: Cards, tables, lists, forms
 * 
 * 2. COMPONENT LEVEL - Use Spinner with context
 *    - Use for data fetching within components
 *    - Show spinner centered in the component area
 *    - Include descriptive text if loading takes >2s
 *    - Example: "Loading orders..."
 * 
 * 3. BUTTON LEVEL - Use inline spinner + disabled state
 *    - Disable the button during loading
 *    - Replace button text with loading state
 *    - Keep button same width to prevent layout shift
 *    - Example: "Submitting..." with spinner
 * 
 * 4. INLINE/SUBTLE - Use small spinner
 *    - For refreshing data without blocking UI
 *    - For background operations
 *    - Position near the content being updated
 */

interface SpinnerProps {
    /** Size of the spinner */
    size?: 'sm' | 'md' | 'lg'
    /** Optional loading text */
    text?: string
    /** Center the spinner in its container */
    centered?: boolean
    /** Additional CSS classes */
    className?: string
}

/**
 * Standard loading spinner component.
 * Use for component-level and inline loading states.
 */
export function Spinner({ 
    size = 'md', 
    text, 
    centered = false,
    className 
}: SpinnerProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
    }

    return (
        <div 
            className={cn(
                'flex items-center gap-2',
                centered && 'justify-center',
                className
            )}
            role="status"
            aria-label={text || 'Loading'}
        >
            <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size])} />
            {text && (
                <span className="text-sm text-muted-foreground">{text}</span>
            )}
        </div>
    )
}

/**
 * Full-page loading spinner.
 * Use when the entire view is loading.
 */
export function PageLoader({ text = 'Loading...' }: { text?: string }) {
    return (
        <div className="flex items-center justify-center min-h-[50vh]" role="status" aria-label={text}>
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{text}</p>
            </div>
        </div>
    )
}

/**
 * Card skeleton for loading states.
 * Use in loading.tsx files for card-based layouts.
 */
export function CardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('rounded-lg border bg-card p-6 space-y-4', className)}>
            <div className="space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
            </div>
        </div>
    )
}

/**
 * Table row skeleton for loading states.
 * Use for table-based data loading.
 */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
    return (
        <div className="flex items-center gap-4 p-4 border-b">
            {Array.from({ length: columns }).map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1" />
            ))}
        </div>
    )
}

/**
 * List item skeleton for loading states.
 * Use for list-based data loading.
 */
export function ListItemSkeleton({ hasAvatar = false }: { hasAvatar?: boolean }) {
    return (
        <div className="flex items-center gap-3 p-3">
            {hasAvatar && <Skeleton className="h-10 w-10 rounded-full shrink-0" />}
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </div>
        </div>
    )
}

/**
 * Button loading state helper.
 * Use this pattern for buttons that trigger async actions.
 * 
 * @example
 * ```tsx
 * <Button disabled={isLoading}>
 *   {isLoading ? <ButtonLoader text="Saving..." /> : 'Save'}
 * </Button>
 * ```
 */
export function ButtonLoader({ text = 'Loading...' }: { text?: string }) {
    return (
        <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            {text}
        </>
    )
}
