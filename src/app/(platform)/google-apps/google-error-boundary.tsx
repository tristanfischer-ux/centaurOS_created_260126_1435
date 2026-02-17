/**
 * GoogleErrorBoundary -- Shared error handling for Google API failures.
 *
 * @description Wraps each tab's content and provides consistent error UI for:
 * - Token expired/revoked (401/403) -> reconnect prompt
 * - Missing scopes for a feature -> scoped connect CTA
 * - Transient API errors -> retry button
 *
 * @component
 */

'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Link2, RefreshCw } from 'lucide-react'

/** Known Google error patterns that indicate token issues */
const TOKEN_ERROR_PATTERNS = [
    'Token has been expired or revoked',
    'invalid_grant',
    'Invalid Credentials',
    'Request had insufficient authentication scopes',
    'Unauthorized',
    'Google account not connected',
]

/**
 * Determines the type of Google error from an error string.
 *
 * @param error - Error message from a server action
 * @returns Error classification
 */
function classifyGoogleError(error: string): 'token_expired' | 'missing_scope' | 'transient' {
    const lower = error.toLowerCase()

    if (
        lower.includes('expired') ||
        lower.includes('revoked') ||
        lower.includes('invalid_grant') ||
        lower.includes('invalid credentials') ||
        lower.includes('not connected')
    ) {
        return 'token_expired'
    }

    if (lower.includes('insufficient') && lower.includes('scope')) {
        return 'missing_scope'
    }

    return 'transient'
}

interface GoogleErrorDisplayProps {
    /** The error message from the server action */
    error: string
    /** Which feature this tab needs (for scoped reconnect) */
    feature?: 'calendar' | 'drive' | 'gmail'
    /** Callback to retry the failed operation */
    onRetry?: () => void
}

/**
 * Renders the appropriate error UI based on the Google error type.
 */
export function GoogleErrorDisplay({ error, feature, onRetry }: GoogleErrorDisplayProps) {
    const errorType = classifyGoogleError(error)

    const connectFeatures = feature ? `calendar,drive,${feature}` : 'calendar,drive'
    const connectUrl = `/api/google/connect?features=${connectFeatures}&redirect=/google-apps`

    if (errorType === 'token_expired') {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-status-warning-light mb-4">
                    <AlertCircle className="h-6 w-6 text-status-warning" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                    Google connection expired
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    Your Google connection has expired or was revoked. Reconnect to continue accessing your files and calendar.
                </p>
                <Button asChild>
                    <a href={connectUrl}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Reconnect Google
                    </a>
                </Button>
            </div>
        )
    }

    if (errorType === 'missing_scope') {
        const featureLabel = feature === 'gmail' ? 'Email' : feature === 'calendar' ? 'Calendar' : 'Drive'
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-status-info-light mb-4">
                    <Link2 className="h-6 w-6 text-status-info" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">
                    Enable {featureLabel} access
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    Your Google account is connected, but {featureLabel} permissions haven&apos;t been granted yet.
                </p>
                <Button asChild>
                    <a href={connectUrl}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Grant {featureLabel} Access
                    </a>
                </Button>
            </div>
        )
    }

    // Transient error
    return (
        <Alert variant="destructive" className="mx-4 my-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
                <span>Google is temporarily unavailable. {error}</span>
                {onRetry && (
                    <Button variant="ghost" size="sm" onClick={onRetry}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Retry
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    )
}
