'use client'

import { useState, useEffect, useTransition } from 'react'
import { 
    RefreshCw, 
    Link2,
    Unlink,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { 
    getSheetsIntegration, 
    updateSheetsIntegration, 
    triggerManualSync,
    type SheetsIntegrationConfig 
} from '@/actions/sheets-sync'

interface DataSyncTabProps {
    foundryId: string
    isFounder: boolean
}

const SYNCABLE_TABLES = [
    { id: 'tasks', label: 'Tasks' },
    { id: 'objectives', label: 'Objectives' },
    { id: 'standups', label: 'Standups' },
    { id: 'profiles', label: 'Team Members' },
]

export function DataSyncTab({ foundryId, isFounder }: DataSyncTabProps) {
    const [isPending, startTransition] = useTransition()
    const [config, setConfig] = useState<SheetsIntegrationConfig | null>(null)
    const [sheetId, setSheetId] = useState('')
    const [tablesToSync, setTablesToSync] = useState<string[]>(['tasks', 'objectives', 'standups'])
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    
    useEffect(() => {
        async function loadIntegration() {
            setLoading(true)
            const result = await getSheetsIntegration()
            if (result.config) {
                setConfig(result.config)
                setSheetId(result.config.sheet_id || '')
                setTablesToSync(result.config.tables_to_sync || ['tasks', 'objectives', 'standups'])
                setIsConnected(result.config.sync_enabled || false)
            }
            setLoading(false)
        }
        loadIntegration()
    }, [])
    
    const handleConnect = async () => {
        if (!sheetId.trim()) {
            setError('Please enter a Google Sheet ID')
            return
        }
        
        setError(null)
        setSuccess(null)
        
        startTransition(async () => {
            const result = await updateSheetsIntegration({
                sheet_id: sheetId.trim(),
                sync_enabled: true,
                tables_to_sync: tablesToSync
            })
            
            if (result.error) {
                setError(result.error)
            } else {
                setSuccess('Google Sheets connected successfully')
                setIsConnected(true)
                setConfig(result.config || null)
            }
        })
    }
    
    const handleDisconnect = async () => {
        setError(null)
        setSuccess(null)
        
        startTransition(async () => {
            const result = await updateSheetsIntegration({
                sync_enabled: false
            })
            
            if (result.error) {
                setError(result.error)
            } else {
                setSuccess('Google Sheets disconnected')
                setIsConnected(false)
            }
        })
    }
    
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
    
    const toggleTable = (tableId: string) => {
        setTablesToSync(prev => 
            prev.includes(tableId)
                ? prev.filter(t => t !== tableId)
                : [...prev, tableId]
        )
    }
    
    const formatLastSync = (timestamp: string | null) => {
        if (!timestamp) return 'Never'
        const date = new Date(timestamp)
        return date.toLocaleString()
    }
    
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-foundry-400" />
            </div>
        )
    }
    
    return (
        <div className="space-y-4">
            {/* Connection status */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-foundry-50">
                <div className="flex items-center gap-2">
                    {isConnected ? (
                        <>
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            <span className="text-sm font-medium text-foundry-900">Connected</span>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            <span className="text-sm font-medium text-foundry-900">Not Connected</span>
                        </>
                    )}
                </div>
                {isConnected && config?.last_sync_at && (
                    <div className="flex items-center gap-1 text-xs text-foundry-500">
                        <Clock className="h-3 w-3" />
                        Last sync: {formatLastSync(config.last_sync_at)}
                    </div>
                )}
            </div>
            
            {error && (
                <div className="p-2 text-xs bg-red-50 text-red-700 rounded-md">
                    {error}
                </div>
            )}
            {success && (
                <div className="p-2 text-xs bg-green-50 text-green-700 rounded-md">
                    {success}
                </div>
            )}
            
            {!isConnected ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="sheetId" className="text-xs font-medium text-foundry-700">
                            Google Sheet ID
                        </Label>
                        <Input
                            id="sheetId"
                            value={sheetId}
                            onChange={(e) => setSheetId(e.target.value)}
                            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                            className="h-9 text-sm"
                        />
                        <p className="text-xs text-foundry-500">
                            Find the ID in your Google Sheet URL: docs.google.com/spreadsheets/d/<strong>[ID]</strong>/edit
                        </p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-foundry-700">Data to Sync</Label>
                        <div className="space-y-2">
                            {SYNCABLE_TABLES.map((table) => (
                                <div
                                    key={table.id}
                                    className="flex items-center justify-between p-2 rounded-lg bg-foundry-50"
                                >
                                    <span className="text-sm text-foundry-700">{table.label}</span>
                                    <Switch
                                        checked={tablesToSync.includes(table.id)}
                                        onCheckedChange={() => toggleTable(table.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <Button
                        onClick={handleConnect}
                        disabled={isPending || !sheetId.trim()}
                        className="w-full"
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                        )}
                        Connect Google Sheets
                    </Button>
                    
                    <div className="text-xs text-foundry-500 text-center">
                        <a 
                            href="https://docs.google.com/spreadsheets/create" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-electric-blue hover:underline inline-flex items-center gap-1"
                        >
                            Create a new Google Sheet
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-3 rounded-lg border border-foundry-200 bg-white">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-foundry-700">Connected Sheet</span>
                            <a
                                href={`https://docs.google.com/spreadsheets/d/${config?.sheet_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-electric-blue hover:underline inline-flex items-center gap-1"
                            >
                                Open
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                        <code className="text-xs text-foundry-500 break-all">
                            {config?.sheet_id}
                        </code>
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-foundry-700">Syncing</Label>
                        <div className="flex flex-wrap gap-1">
                            {(config?.tables_to_sync || []).map((table) => (
                                <Badge key={table} variant="secondary" className="text-xs bg-foundry-100 border-0">
                                    {SYNCABLE_TABLES.find(t => t.id === table)?.label || table}
                                </Badge>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button
                            onClick={handleSyncNow}
                            disabled={isPending}
                            className="flex-1"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Sync Now
                        </Button>
                        
                        {isFounder && (
                            <Button
                                variant="secondary"
                                onClick={handleDisconnect}
                                disabled={isPending}
                            >
                                <Unlink className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    
                    {config?.sync_errors && config.sync_errors.length > 0 && (
                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                            <div className="flex items-center gap-1 text-xs font-medium text-amber-700 mb-1">
                                <AlertCircle className="h-3 w-3" />
                                Recent Sync Issues
                            </div>
                            <ul className="text-xs text-amber-600 space-y-1">
                                {config.sync_errors.slice(0, 3).map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
