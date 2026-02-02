'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
    Play, 
    RefreshCw, 
    ExternalLink,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    User,
    Crown,
    GraduationCap
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { QATestRun, QATestEnvironment } from "@/types/qa.types"

export function QATestPanel() {
    const [testRuns, setTestRuns] = useState<QATestRun[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isTriggering, setIsTriggering] = useState(false)
    const [selectedEnvironment, setSelectedEnvironment] = useState<QATestEnvironment>('staging')
    const [error, setError] = useState<string | null>(null)
    
    const fetchTestRuns = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/qa-tests')
            if (!response.ok) {
                throw new Error('Failed to fetch test runs')
            }
            const { data } = await response.json()
            setTestRuns(data || [])
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load test runs')
        } finally {
            setIsLoading(false)
        }
    }, [])
    
    useEffect(() => {
        fetchTestRuns()
        
        // Poll for updates every 10 seconds if there's a running test
        const interval = setInterval(() => {
            if (testRuns.some(run => run.status === 'running' || run.status === 'pending')) {
                fetchTestRuns()
            }
        }, 10000)
        
        return () => clearInterval(interval)
    }, [fetchTestRuns, testRuns])
    
    const triggerTests = async () => {
        setIsTriggering(true)
        setError(null)
        
        try {
            const response = await fetch('/api/admin/qa-tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environment: selectedEnvironment }),
            })
            
            const result = await response.json()
            
            if (!response.ok) {
                throw new Error(result.message || 'Failed to trigger tests')
            }
            
            // Refresh the list
            await fetchTestRuns()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to trigger tests')
        } finally {
            setIsTriggering(false)
        }
    }
    
    const getStatusIcon = (status: QATestRun['status']) => {
        switch (status) {
            case 'passed':
                return <CheckCircle2 className="h-5 w-5 text-status-success" />
            case 'failed':
                return <XCircle className="h-5 w-5 text-destructive" />
            case 'running':
                return <Loader2 className="h-5 w-5 text-status-info animate-spin" />
            case 'pending':
                return <Clock className="h-5 w-5 text-muted-foreground" />
            default:
                return <Clock className="h-5 w-5 text-muted-foreground" />
        }
    }
    
    const getStatusBadge = (status: QATestRun['status']) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            passed: 'default',
            failed: 'destructive',
            running: 'secondary',
            pending: 'outline',
            cancelled: 'outline',
        }
        return (
            <Badge variant={variants[status] || 'outline'}>
                {status}
            </Badge>
        )
    }
    
    const getPersonaIcon = (persona: string) => {
        switch (persona) {
            case 'executive':
                return <User className="h-4 w-4" />
            case 'founder':
                return <Crown className="h-4 w-4" />
            case 'apprentice':
                return <GraduationCap className="h-4 w-4" />
            default:
                return null
        }
    }
    
    const getPersonaResult = (results: QATestRun['results'], persona: 'executive' | 'founder' | 'apprentice') => {
        const result = results?.[persona]
        if (!result) return null
        
        return (
            <div className="flex items-center gap-1.5">
                {getPersonaIcon(persona)}
                <span className="capitalize text-sm">{persona}</span>
                {result === 'passed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                ) : result === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                    <span className="text-xs text-muted-foreground">({result})</span>
                )}
            </div>
        )
    }
    
    return (
        <div className="space-y-6">
            {/* Trigger Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Run Tests</CardTitle>
                    <CardDescription>
                        Trigger a new Day in the Life test run for all three personas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Environment:</span>
                            <div className="flex gap-2">
                                <Button
                                    variant={selectedEnvironment === 'staging' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedEnvironment('staging')}
                                >
                                    Staging
                                </Button>
                                <Button
                                    variant={selectedEnvironment === 'production' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedEnvironment('production')}
                                >
                                    Production
                                </Button>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 sm:ml-auto">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchTestRuns}
                                disabled={isLoading}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            <Button
                                onClick={triggerTests}
                                disabled={isTriggering || testRuns.some(r => r.status === 'running')}
                            >
                                {isTriggering ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Triggering...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Run Tests
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-status-error-light text-destructive text-sm">
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>
            
            {/* Test Results */}
            <Card>
                <CardHeader>
                    <CardTitle>Test History</CardTitle>
                    <CardDescription>
                        Recent test runs and their results
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : testRuns.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-muted-foreground">
                                No test runs yet. Click &quot;Run Tests&quot; to start your first test.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {testRuns.map((run) => (
                                <div
                                    key={run.id}
                                    className="p-4 rounded-lg border bg-card"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            {getStatusIcon(run.status)}
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {getStatusBadge(run.status)}
                                                    <Badge variant="outline">
                                                        {run.environment}
                                                    </Badge>
                                                    {run.duration_seconds && (
                                                        <span className="text-xs text-muted-foreground">
                                                            Duration: {Math.floor(run.duration_seconds / 60)}m {run.duration_seconds % 60}s
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {/* Persona Results */}
                                                {run.results && Object.keys(run.results).length > 0 && (
                                                    <div className="flex items-center gap-4 mt-2">
                                                        {getPersonaResult(run.results, 'executive')}
                                                        {getPersonaResult(run.results, 'founder')}
                                                        {getPersonaResult(run.results, 'apprentice')}
                                                    </div>
                                                )}
                                                
                                                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                                                    {run.triggered_by_name && (
                                                        <>
                                                            <span>•</span>
                                                            <span>by {run.triggered_by_name}</span>
                                                        </>
                                                    )}
                                                </div>
                                                
                                                {run.error_message && (
                                                    <p className="mt-2 text-sm text-destructive">
                                                        {run.error_message}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {run.artifacts_url && (
                                            <a
                                                href={run.artifacts_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="shrink-0"
                                            >
                                                <Button variant="ghost" size="sm">
                                                    <ExternalLink className="h-4 w-4 mr-1" />
                                                    View Report
                                                </Button>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            
            {/* Test Coverage Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Test Coverage</CardTitle>
                    <CardDescription>
                        What gets tested in each persona flow
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Executive */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium">
                                <User className="h-4 w-4 text-muted-foreground" />
                                Executive
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Login and dashboard</li>
                                <li>• Sidebar navigation</li>
                                <li>• Messaging (view/send)</li>
                                <li>• Task creation</li>
                                <li>• Task approval access</li>
                                <li>• Member management</li>
                                <li>• Admin panel access</li>
                            </ul>
                        </div>
                        
                        {/* Founder */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium">
                                <Crown className="h-4 w-4 text-muted-foreground" />
                                Founder
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• All Executive tests</li>
                                <li>• Foundry settings access</li>
                                <li>• Full admin access</li>
                                <li>• All admin sub-pages</li>
                                <li>• Team management</li>
                            </ul>
                        </div>
                        
                        {/* Apprentice */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 font-medium">
                                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                                Apprentice
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Login and dashboard</li>
                                <li>• Sidebar navigation</li>
                                <li>• Messaging (view/send)</li>
                                <li>• Own task creation</li>
                                <li>• No admin access (negative)</li>
                                <li>• No approval access (negative)</li>
                                <li>• Guild/apprenticeship pages</li>
                                <li>• OTJT logging UI</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
