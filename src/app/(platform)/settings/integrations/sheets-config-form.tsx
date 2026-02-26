'use client'

/**
 * @file sheets-config-form.tsx
 *
 * @description Two-card layout for Google Sheets and Microsoft Excel integration.
 * Admins connect their account via OAuth, click "Create Spreadsheet", and get a
 * shareable link. Zero technical knowledge required.
 *
 * DECISION: Full rewrite of the previous 4-step wizard (SA upload → spreadsheet →
 * Apps Script → sync controls) into a 3-click flow: Connect → Create → Share.
 */

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    CheckCircle2,
    AlertTriangle,
    RefreshCw,
    Copy,
    FileSpreadsheet,
    Loader2,
    ExternalLink,
    XCircle,
} from 'lucide-react'
import {
    createAndInitializeSpreadsheet,
    triggerManualSync,
    updateSheetsIntegration,
    disableSync,
} from '@/actions/sheets-sync'
import type { SheetsIntegrationConfig } from '@/actions/sheets-sync'
import type { ProviderType } from '@/lib/spreadsheet/provider'

interface SheetsConfigFormProps {
    googleConfig: SheetsIntegrationConfig | null
    googleStatus: {
        is_connected: boolean
        has_spreadsheet: boolean
        last_sync: string | null
        recent_errors: string[]
        oauth_email: string | null
    }
    googleConnection: {
        connected: boolean
        email: string | null
    }
    microsoftConfig: SheetsIntegrationConfig | null
    microsoftStatus: {
        is_connected: boolean
        has_spreadsheet: boolean
        last_sync: string | null
        recent_errors: string[]
        oauth_email: string | null
    }
    microsoftConnection: {
        connected: boolean
        email: string | null
    }
}

export function SheetsConfigForm({
    googleConfig,
    googleStatus,
    googleConnection,
    microsoftConfig,
    microsoftStatus,
    microsoftConnection,
}: SheetsConfigFormProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProviderCard
                providerType="google_sheets"
                providerName="Google Sheets"
                icon="sheets"
                config={googleConfig}
                status={googleStatus}
                connection={googleConnection}
                connectUrl="/api/google/connect?features=sheets&redirect=/settings/integrations"
            />
            <ProviderCard
                providerType="microsoft_excel"
                providerName="Microsoft Excel"
                icon="excel"
                config={microsoftConfig}
                status={microsoftStatus}
                connection={microsoftConnection}
                connectUrl="/api/microsoft/connect?redirect=/settings/integrations"
            />
        </div>
    )
}

// ============================================================
// Provider Card
// ============================================================

function ProviderCard({
    providerType,
    providerName,
    icon,
    config: initialConfig,
    status: initialStatus,
    connection,
    connectUrl,
}: {
    providerType: ProviderType
    providerName: string
    icon: 'sheets' | 'excel'
    config: SheetsIntegrationConfig | null
    status: {
        is_connected: boolean
        has_spreadsheet: boolean
        last_sync: string | null
        recent_errors: string[]
        oauth_email: string | null
    }
    connection: {
        connected: boolean
        email: string | null
    }
    connectUrl: string
}) {
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [config, setConfig] = useState(initialConfig)
    const [status, setStatus] = useState(initialStatus)
    const [copied, setCopied] = useState(false)

    function showMessage(type: 'success' | 'error', text: string) {
        setMessage({ type, text })
        setTimeout(() => setMessage(null), 5000)
    }

    function handleCopyLink() {
        if (config?.spreadsheet_url) {
            navigator.clipboard.writeText(config.spreadsheet_url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    function handleCreateSpreadsheet() {
        startTransition(async () => {
            const result = await createAndInitializeSpreadsheet(providerType)
            if (result.error) {
                showMessage('error', result.error)
            } else {
                showMessage('success', 'Spreadsheet created and synced!')
                setConfig(prev => prev ? {
                    ...prev,
                    spreadsheet_id: result.spreadsheetId || null,
                    spreadsheet_url: result.spreadsheetUrl || null,
                    sync_enabled: true,
                } : prev)
                setStatus(prev => ({ ...prev, has_spreadsheet: true, is_connected: true }))
            }
        })
    }

    function handleSyncNow() {
        startTransition(async () => {
            const result = await triggerManualSync(providerType)
            if (result.error) {
                showMessage('error', result.error)
            } else {
                showMessage('success', `Synced ${result.tasksWritten} tasks`)
                setConfig(prev => prev ? {
                    ...prev,
                    last_sync_at: new Date().toISOString(),
                    sync_errors: [],
                } : prev)
            }
        })
    }

    function handleDisableSync() {
        startTransition(async () => {
            const result = await disableSync(providerType)
            if (result.error) {
                showMessage('error', result.error)
            } else {
                setConfig(prev => prev ? {
                    ...prev,
                    sync_enabled: false,
                    spreadsheet_id: null,
                    spreadsheet_url: null,
                } : prev)
                setStatus(prev => ({ ...prev, is_connected: false, has_spreadsheet: false }))
                showMessage('success', 'Sync disabled')
            }
        })
    }

    function handleToggleSync() {
        const newEnabled = !config?.sync_enabled
        startTransition(async () => {
            const result = await updateSheetsIntegration({ sync_enabled: newEnabled }, providerType)
            if (result.error) {
                showMessage('error', result.error)
            } else {
                setConfig(prev => prev ? { ...prev, sync_enabled: newEnabled } : prev)
                setStatus(prev => ({ ...prev, is_connected: newEnabled }))
                showMessage('success', newEnabled ? 'Sync enabled' : 'Sync paused')
            }
        })
    }

    // Determine what state we're in
    const isOAuthConnected = connection.connected
    const hasSpreadsheet = status.has_spreadsheet && !!config?.spreadsheet_url
    const isSyncing = config?.sync_enabled

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                        icon === 'sheets' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'
                    }`}>
                        <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-base">{providerName}</CardTitle>
                        <CardDescription className="text-xs">
                            {hasSpreadsheet ? 'Spreadsheet syncing' : 'Connect to sync tasks'}
                        </CardDescription>
                    </div>
                    {isSyncing ? (
                        <Badge variant="success">Active</Badge>
                    ) : hasSpreadsheet ? (
                        <Badge variant="secondary">Paused</Badge>
                    ) : isOAuthConnected ? (
                        <Badge variant="secondary">Connected</Badge>
                    ) : null}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Feedback message */}
                {message && (
                    <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                        message.type === 'success'
                            ? 'bg-success/10 text-success'
                            : 'bg-destructive/10 text-destructive'
                    }`}>
                        {message.type === 'success' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {message.text}
                    </div>
                )}

                {/* State: Not connected */}
                {!isOAuthConnected && !hasSpreadsheet && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Sign in with your {icon === 'sheets' ? 'Google' : 'Microsoft'} account to get started.
                        </p>
                        <Button asChild size="sm">
                            <a href={connectUrl}>
                                Connect {icon === 'sheets' ? 'Google' : 'Microsoft'}
                            </a>
                        </Button>
                    </div>
                )}

                {/* State: Connected but no spreadsheet */}
                {isOAuthConnected && !hasSpreadsheet && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-success">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>Connected as {connection.email}</span>
                        </div>
                        <Button
                            size="sm"
                            disabled={isPending}
                            onClick={handleCreateSpreadsheet}
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                            )}
                            Create Spreadsheet
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Creates a spreadsheet in your {icon === 'sheets' ? 'Google Drive' : 'OneDrive'} with
                            tabs for each team member, a master task list, and a Gantt chart.
                        </p>
                    </div>
                )}

                {/* State: Spreadsheet exists */}
                {hasSpreadsheet && (
                    <div className="space-y-4">
                        {/* Connected email */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                            <span>Connected as {connection.email || status.oauth_email}</span>
                        </div>

                        {/* Share link */}
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-foreground">
                                Share this link with your team:
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 text-xs bg-muted px-2.5 py-1.5 rounded font-mono truncate">
                                    {config?.spreadsheet_url}
                                </code>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 shrink-0"
                                    onClick={handleCopyLink}
                                >
                                    {copied ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Anyone with this link can view and edit tasks.
                                Changes sync back to ForgeOS every few minutes.
                            </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                asChild
                            >
                                <a
                                    href={config?.spreadsheet_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    Open
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSyncNow}
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Sync Now
                            </Button>
                            {isSyncing ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleToggleSync}
                                    disabled={isPending}
                                    className="text-muted-foreground"
                                >
                                    Pause
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleToggleSync}
                                    disabled={isPending}
                                    className="text-success"
                                >
                                    Resume
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDisableSync}
                                disabled={isPending}
                                className="text-destructive"
                            >
                                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                Disconnect
                            </Button>
                        </div>

                        {/* Last sync */}
                        {config?.last_sync_at && (
                            <p className="text-xs text-muted-foreground">
                                Last sync: {new Date(config.last_sync_at).toLocaleString()}
                            </p>
                        )}

                        {/* Recent errors */}
                        {status.recent_errors.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-destructive">Recent errors:</p>
                                {status.recent_errors.map((err, i) => (
                                    <p key={i} className="text-xs text-muted-foreground font-mono p-1.5 bg-muted rounded truncate">
                                        {err}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
