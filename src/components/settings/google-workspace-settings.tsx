/**
 * GoogleWorkspaceSettings - Manages Google Workspace connection and features.
 *
 * @description Displays the current Google account connection status and allows
 * users to connect/disconnect their Google account. Shows enabled features
 * (Calendar, Drive, Gmail) based on granted OAuth scopes.
 *
 * @component
 *
 * @example
 * <GoogleWorkspaceSettings status={connectionStatus} />
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
    Calendar,
    HardDrive,
    Mail,
    Link2,
    Unlink,
    CheckCircle2,
    XCircle,
    Loader2,
    Video,
    AlertCircle,
} from 'lucide-react'
import { disconnectGoogle } from '@/actions/google-workspace'
import type { GoogleConnectionStatus } from '@/actions/google-workspace'
import { toast } from 'sonner'

interface GoogleWorkspaceSettingsProps {
    /** Current connection status */
    status: GoogleConnectionStatus
    /** Error message from URL params (consent denied, etc.) */
    errorMessage?: string | null
    /** Success message from URL params */
    successMessage?: string | null
}

const FEATURES = [
    {
        id: 'calendar' as const,
        name: 'Google Calendar',
        description: 'Sync task due dates, discovery calls, and objectives to your calendar. Auto-generates Google Meet links.',
        icon: Calendar,
        secondaryIcon: Video,
    },
    {
        id: 'drive' as const,
        name: 'Google Drive',
        description: 'Attach files from Google Drive to tasks and messages without re-uploading.',
        icon: HardDrive,
    },
    {
        id: 'gmail' as const,
        name: 'Gmail Notifications',
        description: 'Receive ForgeOS notifications through your Gmail. Replies route back to you.',
        icon: Mail,
    },
]

const ERROR_MESSAGES: Record<string, string> = {
    consent_denied: 'You declined the Google permissions request. Connect again to enable features.',
    missing_params: 'Something went wrong during the connection. Please try again.',
    invalid_state: 'The connection request was invalid. Please try again.',
    user_mismatch: 'Session mismatch detected. Please try connecting again.',
    no_token: 'Google did not provide the required tokens. Please try again.',
    save_failed: 'Failed to save your Google connection. Please try again.',
    exchange_failed: 'Failed to complete the Google connection. Please try again.',
}

export function GoogleWorkspaceSettings({
    status,
    errorMessage,
    successMessage,
}: GoogleWorkspaceSettingsProps) {
    const [isDisconnecting, setIsDisconnecting] = useState(false)

    async function handleDisconnect(): Promise<void> {
        setIsDisconnecting(true)
        try {
            const result = await disconnectGoogle()
            if (result.success) {
                toast.success('Google account disconnected')
            } else {
                toast.error(result.error || 'Failed to disconnect')
            }
        } catch (err) {
            console.error('[GoogleWorkspaceSettings] Disconnect error:', err)
            toast.error('Failed to disconnect Google account')
        } finally {
            setIsDisconnecting(false)
        }
    }

    const resolvedError = errorMessage ? ERROR_MESSAGES[errorMessage] || errorMessage : null

    return (
        <Card className="bg-background border shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        </div>
                        <div>
                            <CardTitle>Google Workspace</CardTitle>
                            <CardDescription>
                                Connect your Google account to sync calendars, files, and meetings.
                            </CardDescription>
                        </div>
                    </div>
                    {status.connected && (
                        <StatusBadge status="success" size="sm">Connected</StatusBadge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Error/Success Alerts */}
                {resolvedError && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{resolvedError}</AlertDescription>
                    </Alert>
                )}
                {successMessage === 'connected' && (
                    <Alert>
                        <CheckCircle2 className="h-4 w-4 text-status-success" />
                        <AlertDescription className="text-status-success">
                            Google account connected successfully.
                        </AlertDescription>
                    </Alert>
                )}

                {/* Connection Status */}
                {status.connected ? (
                    <div className="space-y-6">
                        {/* Connected Account Info */}
                        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-5 w-5 text-status-success" />
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {status.googleEmail}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Connected Google Account
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDisconnect}
                                disabled={isDisconnecting}
                                className="text-destructive hover:text-destructive"
                            >
                                {isDisconnecting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Unlink className="h-4 w-4" />
                                )}
                                <span className="ml-2">Disconnect</span>
                            </Button>
                        </div>

                        {/* Feature Status List */}
                        <div className="space-y-3">
                            <p className="text-sm font-medium text-foreground">Enabled Features</p>
                            {FEATURES.map((feature) => {
                                const isEnabled = status.features[feature.id]
                                const Icon = feature.icon

                                return (
                                    <div
                                        key={feature.id}
                                        className="flex items-start gap-3 rounded-lg border p-4"
                                    >
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-foreground">
                                                    {feature.name}
                                                </p>
                                                {isEnabled ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Feature Preview */}
                        <div className="space-y-3">
                            {FEATURES.map((feature) => {
                                const Icon = feature.icon

                                return (
                                    <div
                                        key={feature.id}
                                        className="flex items-start gap-3 rounded-lg border p-4 opacity-70"
                                    >
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                                            <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground">
                                                {feature.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Connect Button */}
                        <Button
                            asChild
                            className="w-full"
                        >
                            <a href="/api/google/connect?features=calendar,drive">
                                <Link2 className="h-4 w-4 mr-2" />
                                Connect Google Account
                            </a>
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                            You&apos;ll be redirected to Google to grant access. You can disconnect at any time.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
