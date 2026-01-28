'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { 
    CheckCircle2, 
    Target, 
    AlertTriangle, 
    Smile, 
    Meh, 
    Frown,
    ChevronDown,
    ChevronUp,
    Loader2,
    Users,
    Sparkles
} from 'lucide-react'
import { 
    getMyTodayStandup, 
    submitStandup, 
    getTodayTeamStandups,
    getStandupStats,
    generateStandupSummary,
    getLatestSummary,
    type Standup,
    type StandupSummary
} from '@/actions/standups'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { Markdown } from '@/components/ui/markdown'

const moodOptions = [
    { value: 'great', icon: Smile, label: 'Great', color: 'text-green-500 bg-green-50 border-green-200' },
    { value: 'good', icon: Smile, label: 'Good', color: 'text-blue-500 bg-blue-50 border-blue-200' },
    { value: 'okay', icon: Meh, label: 'Okay', color: 'text-yellow-500 bg-yellow-50 border-yellow-200' },
    { value: 'struggling', icon: Frown, label: 'Struggling', color: 'text-red-500 bg-red-50 border-red-200' }
] as const

function getInitials(name: string | null) {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

interface StandupWidgetProps {
    userRole?: string
    compact?: boolean
}

export function StandupWidget({ userRole, compact = false }: StandupWidgetProps) {
    const [myStandup, setMyStandup] = useState<Standup | null>(null)
    const [teamStandups, setTeamStandups] = useState<Standup[]>([])
    const [stats, setStats] = useState<{ totalMembers: number; submittedToday: number; participationRate: number; membersWithBlockers: number } | null>(null)
    const [summary, setSummary] = useState<StandupSummary | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [isExpanded, setIsExpanded] = useState(false)
    const [showForm, setShowForm] = useState(false)
    
    // Form state
    const [completed, setCompleted] = useState('')
    const [planned, setPlanned] = useState('')
    const [blockers, setBlockers] = useState('')
    const [mood, setMood] = useState<'great' | 'good' | 'okay' | 'struggling' | null>(null)
    const [needsHelp, setNeedsHelp] = useState(false)

    const isExecutive = userRole === 'Executive' || userRole === 'Founder'

    const loadData = useCallback(async () => {
        setIsLoading(true)
        
        // Load my standup
        const myResult = await getMyTodayStandup()
        if (myResult.data) {
            setMyStandup(myResult.data)
            setCompleted(myResult.data.completed || '')
            setPlanned(myResult.data.planned || '')
            setBlockers(myResult.data.blockers || '')
            setMood(myResult.data.mood as typeof mood)
            setNeedsHelp(myResult.data.needs_help)
        }
        
        // Load stats
        const statsResult = await getStandupStats()
        if (statsResult.data) {
            setStats(statsResult.data)
        }

        // Load team standups if executive
        if (isExecutive) {
            const teamResult = await getTodayTeamStandups()
            if (teamResult.data) {
                setTeamStandups(teamResult.data)
            }
            
            // Load latest summary
            const summaryResult = await getLatestSummary()
            if (summaryResult.data) {
                setSummary(summaryResult.data)
            }
        }
        
        setIsLoading(false)
    }, [isExecutive])

    useEffect(() => {
        let mounted = true
        
        const fetchData = async () => {
            if (!mounted) return
            await loadData()
        }
        
        fetchData()
        
        return () => {
            mounted = false
        }
    }, [loadData])

    const handleSubmit = async () => {
        startTransition(async () => {
            const result = await submitStandup({
                completed: completed || undefined,
                planned: planned || undefined,
                blockers: blockers || undefined,
                needsHelp,
                mood: mood || undefined
            })
            
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Standup submitted!')
                setMyStandup(result.data)
                setShowForm(false)
                loadData() // Refresh stats
            }
        })
    }

    const handleGenerateSummary = async () => {
        startTransition(async () => {
            const result = await generateStandupSummary()
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Summary generated!')
                setSummary(result.data)
            }
        })
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        )
    }

    const hasSubmitted = !!myStandup

    // Compact view for dashboard
    if (compact) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Target className="h-4 w-4 text-slate-600" />
                            Daily Standup
                        </CardTitle>
                        {hasSubmitted ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Done
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                                Pending
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {hasSubmitted ? (
                        <div className="text-sm text-slate-600">
                            <p className="line-clamp-2">{myStandup?.planned || 'No plans shared'}</p>
                            <Button 
                                variant="link" 
                                size="sm" 
                                className="px-0 h-auto text-xs"
                                onClick={() => setShowForm(true)}
                            >
                                Edit standup
                            </Button>
                        </div>
                    ) : (
                        <Button 
                            size="sm" 
                            onClick={() => setShowForm(true)}
                            className="w-full"
                        >
                            Submit Standup
                        </Button>
                    )}
                    
                    {stats && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>{stats.submittedToday}/{stats.totalMembers} submitted</span>
                                <span>{stats.participationRate}%</span>
                            </div>
                            <Progress value={stats.participationRate} className="h-1 mt-1" />
                        </div>
                    )}
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-slate-600" />
                            Daily Standup
                        </CardTitle>
                        <CardDescription>
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </CardDescription>
                    </div>
                    {hasSubmitted && !showForm && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Submitted
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Standup Form */}
                {(showForm || !hasSubmitted) && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="standup-yesterday" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                What did you accomplish?
                            </label>
                            <Textarea
                                id="standup-yesterday"
                                value={completed}
                                onChange={(e) => setCompleted(e.target.value)}
                                placeholder="Yesterday I completed..."
                                className="min-h-[80px] bg-white border-slate-200"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label htmlFor="standup-today" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <Target className="h-4 w-4 text-blue-500" />
                                What will you work on today?
                            </label>
                            <Textarea
                                id="standup-today"
                                value={planned}
                                onChange={(e) => setPlanned(e.target.value)}
                                placeholder="Today I plan to..."
                                className="min-h-[80px] bg-white border-slate-200"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label htmlFor="standup-blockers" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                Any blockers or issues?
                            </label>
                            <Textarea
                                id="standup-blockers"
                                value={blockers}
                                onChange={(e) => setBlockers(e.target.value)}
                                placeholder="I'm blocked by... (or leave empty)"
                                className="min-h-[60px] bg-white border-slate-200"
                            />
                            {blockers && (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={needsHelp}
                                        onChange={(e) => setNeedsHelp(e.target.checked)}
                                        className="rounded border-slate-300"
                                    />
                                    <span className="text-slate-600">I need help unblocking this</span>
                                </label>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">How are you feeling?</label>
                            <div className="flex gap-2">
                                {moodOptions.map((option) => {
                                    const Icon = option.icon
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setMood(option.value)}
                                            className={cn(
                                                'flex-1 py-2 px-3 rounded-lg border transition-all',
                                                mood === option.value
                                                    ? option.color + ' border-2'
                                                    : 'border-slate-200 hover:border-slate-300 bg-white'
                                            )}
                                        >
                                            <Icon className={cn(
                                                'h-5 w-5 mx-auto',
                                                mood === option.value ? '' : 'text-slate-400'
                                            )} />
                                            <span className={cn(
                                                'text-xs block mt-1',
                                                mood === option.value ? '' : 'text-slate-500'
                                            )}>
                                                {option.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={handleSubmit}
                                disabled={isPending || (!completed && !planned)}
                                className="flex-1"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                {hasSubmitted ? 'Update Standup' : 'Submit Standup'}
                            </Button>
                            {hasSubmitted && (
                                <Button variant="outline" onClick={() => setShowForm(false)}>
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* Submitted View */}
                {hasSubmitted && !showForm && (
                    <div className="space-y-3">
                        {myStandup?.completed && (
                            <div className="text-sm">
                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    Completed
                                </div>
                                <p className="text-slate-700 pl-6">{myStandup.completed}</p>
                            </div>
                        )}
                        {myStandup?.planned && (
                            <div className="text-sm">
                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                    <Target className="h-4 w-4 text-blue-500" />
                                    Planned
                                </div>
                                <p className="text-slate-700 pl-6">{myStandup.planned}</p>
                            </div>
                        )}
                        {myStandup?.blockers && (
                            <div className="text-sm">
                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    Blockers
                                </div>
                                <p className="text-slate-700 pl-6">{myStandup.blockers}</p>
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                            Edit
                        </Button>
                    </div>
                )}

                {/* Team Stats & Summary (for executives) */}
                {isExecutive && stats && (
                    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                        <div className="border-t border-slate-200 pt-4 mt-4">
                            <CollapsibleTrigger asChild>
                                <button className="flex items-center justify-between w-full text-left">
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-700">Team Overview</span>
                                        <Badge variant="secondary" className="text-xs">
                                            {stats.submittedToday}/{stats.totalMembers}
                                        </Badge>
                                    </div>
                                    {isExpanded ? (
                                        <ChevronUp className="h-4 w-4 text-slate-400" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 text-slate-400" />
                                    )}
                                </button>
                            </CollapsibleTrigger>
                            
                            <div className="mt-2">
                                <Progress value={stats.participationRate} className="h-2" />
                                <p className="text-xs text-slate-500 mt-1">
                                    {stats.participationRate}% participation
                                    {stats.membersWithBlockers > 0 && (
                                        <span className="text-amber-600 ml-2">
                                            • {stats.membersWithBlockers} with blockers
                                        </span>
                                    )}
                                </p>
                            </div>

                            <CollapsibleContent className="space-y-4 mt-4">
                                {/* AI Summary */}
                                <div className="bg-slate-50 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-purple-500" />
                                            AI Summary
                                        </h4>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleGenerateSummary}
                                            disabled={isPending || stats.submittedToday === 0}
                                        >
                                            {isPending ? (
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                            ) : (
                                                <Sparkles className="h-3 w-3 mr-1" />
                                            )}
                                            Generate
                                        </Button>
                                    </div>
                                    {summary ? (
                                        <div className="prose prose-sm max-w-none">
                                            <Markdown content={summary.summary_text} />
                                            <p className="text-xs text-slate-400 mt-2">
                                                Generated {formatDistanceToNow(new Date(summary.generated_at), { addSuffix: true })}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500">
                                            Click generate to create an AI summary of today's standups.
                                        </p>
                                    )}
                                </div>

                                {/* Team Standups List */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-slate-700">Individual Standups</h4>
                                    {teamStandups.length === 0 ? (
                                        <p className="text-sm text-slate-500">No standups submitted yet today.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {teamStandups.map((standup) => {
                                                const user = standup.user as { full_name: string | null; role: string | null } | undefined
                                                return (
                                                    <div key={standup.id} className="p-3 bg-white rounded-lg border border-slate-200">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Avatar className="h-6 w-6">
                                                                <AvatarFallback className="text-xs bg-slate-100 text-slate-600">
                                                                    {getInitials(user?.full_name || null)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm font-medium text-slate-900">
                                                                {user?.full_name || 'Unknown'}
                                                            </span>
                                                            {standup.mood && (
                                                                <Badge variant="outline" className="text-xs">
                                                                    {standup.mood}
                                                                </Badge>
                                                            )}
                                                            {standup.needs_help && (
                                                                <Badge variant="destructive" className="text-xs">
                                                                    Needs Help
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {standup.planned && (
                                                            <p className="text-sm text-slate-600 line-clamp-2">
                                                                <span className="text-slate-400">Today:</span> {standup.planned}
                                                            </p>
                                                        )}
                                                        {standup.blockers && (
                                                            <p className="text-sm text-amber-600 mt-1 line-clamp-2">
                                                                <AlertTriangle className="h-3 w-3 inline mr-1" />
                                                                {standup.blockers}
                                                            </p>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </CollapsibleContent>
                        </div>
                    </Collapsible>
                )}
            </CardContent>
        </Card>
    )
}
