'use client'

import { useState, useEffect, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { 
    Settings, 
    UserMinus, 
    RefreshCw, 
    CheckCircle2, 
    AlertTriangle,
    Clock,
    Database,
    Loader2,
    Save
} from 'lucide-react'
import { 
    getOffboardingSettings, 
    updateOffboardingSettings,
    type OffboardingAction 
} from '@/actions/offboarding'
import { getSyncStatus } from '@/actions/sheets-sync'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export default function AdminSettingsPage() {
    const [isPending, startTransition] = useTransition()
    
    // Offboarding settings state
    const [offboardingSettings, setOffboardingSettings] = useState<{
        default_action: OffboardingAction
        require_task_reassignment: boolean
        retention_days: number
    } | null>(null)
    const [offboardingLoading, setOffboardingLoading] = useState(true)
    
    // Sync status state
    const [syncStatus, setSyncStatus] = useState<{
        is_connected: boolean
        last_sync: string | null
        tables_count: number
        recent_errors: string[]
    } | null>(null)
    const [syncLoading, setSyncLoading] = useState(true)

    // Load data on mount
    useEffect(() => {
        const loadData = async () => {
            // Load offboarding settings
            const offboardingResult = await getOffboardingSettings()
            if (offboardingResult.settings) {
                setOffboardingSettings(offboardingResult.settings)
            }
            setOffboardingLoading(false)

            // Load sync status
            const syncResult = await getSyncStatus()
            if (syncResult.status) {
                setSyncStatus(syncResult.status)
            }
            setSyncLoading(false)
        }
        
        loadData()
    }, [])

    const handleSaveOffboarding = () => {
        if (!offboardingSettings) return
        
        startTransition(async () => {
            const result = await updateOffboardingSettings(offboardingSettings)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Offboarding settings saved')
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                            Admin Settings
                        </h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                        Configure platform-wide settings
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Offboarding Settings */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <UserMinus className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Offboarding Settings</CardTitle>
                        </div>
                        <CardDescription>
                            Configure how member offboarding is handled
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {offboardingLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : offboardingSettings ? (
                            <>
                                <div className="space-y-2">
                                    <Label>Default Offboarding Action</Label>
                                    <Select
                                        value={offboardingSettings.default_action}
                                        onValueChange={(value: OffboardingAction) => 
                                            setOffboardingSettings({ ...offboardingSettings, default_action: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="reassign_delete">
                                                Reassign & Delete
                                            </SelectItem>
                                            <SelectItem value="soft_delete">
                                                Soft Delete (Deactivate)
                                            </SelectItem>
                                            <SelectItem value="anonymize">
                                                Anonymize Data
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        What happens to tasks and data when a member is offboarded
                                    </p>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>Require Task Reassignment</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Force task reassignment before offboarding
                                        </p>
                                    </div>
                                    <Switch
                                        checked={offboardingSettings.require_task_reassignment}
                                        onCheckedChange={(checked) =>
                                            setOffboardingSettings({ ...offboardingSettings, require_task_reassignment: checked })
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Data Retention (days)</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={offboardingSettings.retention_days}
                                        onChange={(e) =>
                                            setOffboardingSettings({ 
                                                ...offboardingSettings, 
                                                retention_days: parseInt(e.target.value) || 30 
                                            })
                                        }
                                        className="w-32"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        How long to retain data after offboarding (for recovery)
                                    </p>
                                </div>

                                <Separator />

                                <Button 
                                    onClick={handleSaveOffboarding}
                                    disabled={isPending}
                                    className="w-full"
                                >
                                    {isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Save Offboarding Settings
                                </Button>
                            </>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                                <p>Could not load settings</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Sheets Sync Status */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Google Sheets Sync</CardTitle>
                        </div>
                        <CardDescription>
                            Monitor data synchronization status
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {syncLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : syncStatus ? (
                            <>
                                {/* Connection Status */}
                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        {syncStatus.is_connected ? (
                                            <CheckCircle2 className="h-6 w-6 text-status-success" />
                                        ) : (
                                            <AlertTriangle className="h-6 w-6 text-status-warning" />
                                        )}
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {syncStatus.is_connected ? 'Connected' : 'Not Connected'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {syncStatus.tables_count} table{syncStatus.tables_count !== 1 ? 's' : ''} configured
                                            </p>
                                        </div>
                                    </div>
                                    <Badge 
                                        variant="secondary"
                                        className={cn(
                                            syncStatus.is_connected 
                                                ? 'bg-status-success-light text-status-success-dark'
                                                : 'bg-status-warning-light text-status-warning-dark'
                                        )}
                                    >
                                        {syncStatus.is_connected ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>

                                {/* Last Sync */}
                                {syncStatus.last_sync && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Last sync:</span>
                                        <span className="font-medium text-foreground">
                                            {formatDistanceToNow(new Date(syncStatus.last_sync), { addSuffix: true })}
                                        </span>
                                    </div>
                                )}

                                {/* Recent Errors */}
                                {syncStatus.recent_errors.length > 0 && (
                                    <div className="space-y-2">
                                        <Label className="text-status-error">Recent Errors</Label>
                                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                            {syncStatus.recent_errors.map((error, idx) => (
                                                <div 
                                                    key={idx}
                                                    className="p-2 rounded bg-status-error-light text-status-error-dark text-xs"
                                                >
                                                    {error}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* No Errors */}
                                {syncStatus.is_connected && syncStatus.recent_errors.length === 0 && (
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-status-success-light">
                                        <CheckCircle2 className="h-4 w-4 text-status-success-dark" />
                                        <span className="text-sm text-status-success-dark">
                                            No sync errors
                                        </span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>Google Sheets integration not configured</p>
                                <p className="text-xs mt-1">
                                    Connect a Google Sheet to enable data synchronization
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
