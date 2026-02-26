'use client'

/**
 * @file DataSyncTab.tsx
 *
 * @description Admin panel tab for viewing spreadsheet sync status.
 * Simplified to show connection status and link to the full integrations page.
 */

import { useState, useEffect, useTransition } from 'react'
import {
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Clock,
    Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    getSheetsIntegration,
    triggerManualSync,
    type SheetsIntegrationConfig
} from '@/actions/sheets-sync'

interface DataSyncTabProps {
    foundryId: string
    isFounder: boolean
}

export function DataSyncTab({ foundryId, isFounder }: DataSyncTabProps) {
    const [isPending, startTransition] = useTransition()
    const [config, setConfig] = useState<SheetsIntegrationConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        async function loadIntegration() {
            setLoading(true)
            const result = await getSheetsIntegration()
            if (result.config) {
                setConfig(result.config)
            }
            setLoading(false)
        }
        loadIntegration()
    }, [])

    const handleSyncNow = async () => {
        setError(null)
        setSuccess(null)

        startTransition(async () => {
            const result = await triggerManualSync()

            if (result.error) {
                setError(result.error)
            } else {
                setSuccess('Sync completed successfully')
                const configResult = await getSheetsIntegration()
                if (configResult.config) {
                    setConfig(configResult.config)
                }
            }
        })
    }

    const formatLastSync = (timestamp: string | null) => {
        if (!timestamp) return 'Never'
        const date = new Date(timestamp)
        return date.toLocaleString()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    const isConnected = config?.sync_enabled || false
    const hasSpreadsheet = !!config?.spreadsheet_id

    return (
        <div className="space-y-4">
            {/* Connection status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-2">
                    {isConnected ? (
                        <>
                            <CheckCircle2 className="h-5 w-5 text-success" />
                            <span className="text-sm font-medium text-foreground">Connected</span>
                            {config?.oauth_email && (
                                <span className="text-xs text-muted-foreground">({config.oauth_email})</span>
                            )}
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-5 w-5 text-warning" />
                            <span className="text-sm font-medium text-foreground">Not Connected</span>
                        </>
                    )}
                </div>
                {isConnected && config?.last_sync_at && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Last sync: {formatLastSync(config.last_sync_at)}
                    </div>
                )}
            </div>

            {error && (
                <div className="p-2 text-xs bg-destructive/10 text-destructive rounded-md">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-2 text-xs bg-success/10 text-success rounded-md">
                    {success}
                </div>
            )}

            {hasSpreadsheet ? (
                <div className="space-y-4">
                    {config?.spreadsheet_url && (
                        <div className="p-3 rounded-lg border border-border bg-background">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">Spreadsheet</span>
                                <a
                                    href={config.spreadsheet_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-international-orange hover:underline inline-flex items-center gap-1"
                                >
                                    Open
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        </div>
                    )}

                    {isConnected && (
                        <Badge variant="success" className="text-xs">
                            Auto-syncing every 3 minutes
                        </Badge>
                    )}

                    <div className="flex gap-2">
                        <Button
                            onClick={handleSyncNow}
                            disabled={isPending}
                            className="flex-1"
                            size="sm"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Sync Now
                        </Button>
                    </div>

                    {config?.sync_errors && config.sync_errors.length > 0 && (
                        <div className="p-2 rounded-lg bg-warning/10 border border-warning">
                            <div className="flex items-center gap-1 text-xs font-medium text-warning mb-1">
                                <AlertCircle className="h-3 w-3" />
                                Recent Sync Issues
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-1">
                                {config.sync_errors.slice(0, 3).map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center space-y-3 py-4">
                    <p className="text-sm text-muted-foreground">
                        No spreadsheet sync configured yet.
                    </p>
                    {isFounder && (
                        <Button asChild variant="outline" size="sm">
                            <a href="/settings/integrations">
                                <Settings className="h-4 w-4 mr-2" />
                                Set up in Integrations
                            </a>
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
