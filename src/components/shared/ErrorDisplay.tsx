'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Error Display Guidelines:
 * 
 * Use ErrorDisplay (Alert) for:
 * - Form validation errors that need to persist
 * - Critical errors that block user action
 * - Errors that require context to understand
 * - Multi-step form errors
 * 
 * Use toast for:
 * - Transient errors (network hiccups)
 * - Action feedback (success/failure of operations)
 * - Non-blocking warnings
 * - Brief notifications that auto-dismiss
 */

interface ErrorDisplayProps {
    /** The error message to display */
    message: string
    /** Optional title for the error */
    title?: string
    /** Whether to show a retry button */
    onRetry?: () => void
    /** Whether to show a dismiss button */
    onDismiss?: () => void
    /** Additional CSS classes */
    className?: string
}

/**
 * Use this component for critical, persistent errors that need user attention.
 * For transient errors, use the showErrorToast helper instead.
 */
export function ErrorDisplay({ 
    message, 
    title = 'Error', 
    onRetry, 
    onDismiss,
    className 
}: ErrorDisplayProps) {
    return (
        <Alert variant="destructive" className={className}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="flex items-center justify-between">
                {title}
                {onDismiss && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 -mr-2" 
                        onClick={onDismiss}
                        aria-label="Dismiss error"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </AlertTitle>
            <AlertDescription className="mt-2">
                <p>{message}</p>
                {onRetry && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="mt-3"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try again
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    )
}

/**
 * Helper function for showing transient error toasts.
 * Use this for non-blocking, auto-dismissing errors.
 */
export function showErrorToast(message: string, options?: {
    title?: string
    action?: {
        label: string
        onClick: () => void
    }
}) {
    toast.error(options?.title || 'Error', {
        description: message,
        action: options?.action ? {
            label: options.action.label,
            onClick: options.action.onClick,
        } : undefined,
    })
}

/**
 * Helper function for showing success toasts.
 */
export function showSuccessToast(message: string, title?: string) {
    toast.success(title || 'Success', {
        description: message,
    })
}

/**
 * Helper function for showing info toasts.
 */
export function showInfoToast(message: string, title?: string) {
    toast.info(title || 'Info', {
        description: message,
    })
}
