'use client'

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
    X, 
    Sparkles, 
    Loader2, 
    Trophy, 
    AlertCircle, 
    Brain, 
    Zap,
    TrendingUp,
    TrendingDown
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TeamMemberForComparison {
    id: string
    full_name: string | null
    email?: string | null
    bio?: string | null
    role: string
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
    paired_ai_id?: string | null
    pairedAI?: { id: string; full_name: string | null }[] | null
}

interface AIAnalysisResult {
    winner: string
    winnerName: string
    reasoning: string
    tradeoffs: string[]
    summary: string
}

interface TeamComparisonModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    members: TeamMemberForComparison[]
}

/**
 * Get role color classes for badges.
 */
function getRoleBadgeClass(role: string): string {
    switch (role) {
        case 'Founder': return 'bg-purple-100 text-purple-700 border-0'
        case 'Executive': return 'bg-status-warning-light text-status-warning-dark border-0'
        case 'AI_Agent': return 'bg-indigo-100 text-indigo-700 border-0'
        case 'Apprentice':
        default: return 'bg-electric-blue-light text-electric-blue border-0'
    }
}

/**
 * Get initials from full name.
 */
function getInitials(name: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Calculate bandwidth score and label.
 */
function getBandwidth(member: TeamMemberForComparison): { 
    label: string
    className: string
    score: number 
} {
    const score = Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
    if (score <= 40) {
        return { label: 'Has capacity', className: 'bg-status-success-light text-status-success-dark', score }
    } else if (score <= 70) {
        return { label: 'At capacity', className: 'bg-status-warning-light text-status-warning-dark', score }
    } else {
        return { label: 'Overloaded', className: 'bg-status-error-light text-status-error-dark', score }
    }
}

// Attributes organized into sections
const ATTRIBUTE_SECTIONS = {
    'Role & Status': ['role', 'bandwidth', 'centaur'],
    'Workload': ['activeTasks', 'pendingTasks', 'completedTasks', 'rejectedTasks'],
    'Details': ['email', 'bio']
} as const

// Attributes where higher is better (for highlighting)
const HIGHER_IS_BETTER = ['completedTasks']
// Attributes where lower is better
const LOWER_IS_BETTER = ['activeTasks', 'pendingTasks', 'rejectedTasks']

/**
 * TeamComparisonModal - Side-by-side comparison dialog for team members.
 * 
 * @description Shows team members in columns with their attributes as rows,
 * organized into sections. Includes AI analysis capability and highlights
 * best values. Matches the marketplace comparison modal look and feel.
 * 
 * @component
 * 
 * @example
 * <TeamComparisonModal
 *   open={showComparison}
 *   onOpenChange={setShowComparison}
 *   members={selectedMembers}
 * />
 */
export function TeamComparisonModal({ 
    open, 
    onOpenChange, 
    members 
}: TeamComparisonModalProps) {
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState<string | null>(null)

    // Clear analysis when modal closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setAiAnalysis(null)
            setAnalysisError(null)
        }
        onOpenChange(newOpen)
    }

    /**
     * Analyze team members with AI to recommend the best match.
     */
    async function analyzeWithAI() {
        setIsAnalyzing(true)
        setAnalysisError(null)
        
        try {
            const response = await fetch('/api/team/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ members })
            })
            const data = await response.json()
            
            if (!response.ok || data.error) {
                setAnalysisError(data.error || 'Failed to analyze. Please try again.')
                return
            }
            
            setAiAnalysis(data)
        } catch (error) {
            console.error('[TeamComparisonModal] AI analysis failed:', error)
            setAnalysisError('Failed to connect to AI service. Please try again.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    if (members.length === 0) return null

    // Pre-compute best values for numeric comparisons
    const bestValues = computeBestValues(members)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent size="xl" className="max-h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-semibold">
                            Compare Members ({members.length} items)
                        </DialogTitle>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={analyzeWithAI}
                            disabled={isAnalyzing || members.length < 2}
                            className="gap-2"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Analyze with AI
                                </>
                            )}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-auto">
                    <div className="p-6 pt-4">
                        {/* AI Analysis Error */}
                        {analysisError && (
                            <Card className="mb-6 p-4 bg-status-error-light border-destructive/20">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="h-5 w-5 text-destructive" />
                                        <p className="text-sm text-destructive">{analysisError}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAnalysisError(null)}
                                        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        )}

                        {/* AI Analysis Results */}
                        {aiAnalysis && (
                            <Card className="mb-6 p-4 bg-accent/10 border-accent/20">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-accent" />
                                        <h3 className="font-semibold text-foreground">AI Analysis</h3>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAiAnalysis(null)}
                                        className="h-7 px-2 text-accent hover:text-accent hover:bg-accent/10"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* Winner Section */}
                                <div className="mb-4 p-3 bg-background rounded-lg border border-accent/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Trophy className="h-4 w-4 text-amber-500" />
                                        <span className="text-sm font-medium text-foreground">Recommended</span>
                                        <Badge className="bg-status-warning-light text-status-warning-dark border-0">
                                            {aiAnalysis.winnerName}
                                        </Badge>
                                    </div>
                                    <p className="text-sm font-medium text-foreground">{aiAnalysis.summary}</p>
                                </div>

                                {/* Detailed Reasoning */}
                                <div className="mb-4">
                                    <h4 className="text-sm font-medium text-foreground mb-2">Why This Choice?</h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.reasoning}</p>
                                </div>

                                {/* Trade-offs */}
                                {aiAnalysis.tradeoffs && aiAnalysis.tradeoffs.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                                            <AlertCircle className="h-4 w-4" />
                                            Trade-offs to Consider
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {aiAnalysis.tradeoffs.map((tradeoff, index) => (
                                                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                                    <span className="text-accent mt-1">•</span>
                                                    <span>{tradeoff}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Mobile: Card Layout */}
                        <div className="block md:hidden space-y-4">
                            {members.map(member => (
                                <MemberComparisonCard 
                                    key={member.id} 
                                    member={member} 
                                    bestValues={bestValues}
                                />
                            ))}
                        </div>

                        {/* Desktop: Table Layout */}
                        <div className="hidden md:block overflow-x-auto pb-4">
                            <table className="w-full border-collapse min-w-max">
                                <thead>
                                    <tr>
                                        <th className="text-left text-sm font-medium text-muted-foreground py-3 pr-4 w-32 align-top sticky left-0 bg-background z-10">
                                            Attribute
                                        </th>
                                        {members.map(member => (
                                            <th key={member.id} className="text-left py-3 px-4 min-w-[200px] max-w-[250px] align-top">
                                                <MemberHeader member={member} />
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(ATTRIBUTE_SECTIONS).map(([sectionName, sectionKeys]) => (
                                        <SectionGroup
                                            key={sectionName}
                                            sectionName={sectionName}
                                            sectionKeys={sectionKeys as readonly string[]}
                                            members={members}
                                            bestValues={bestValues}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Member header in table column.
 */
function MemberHeader({ member }: { member: TeamMemberForComparison }) {
    const isAI = member.role === 'AI_Agent'
    const isCentaur = !!member.paired_ai_id
    
    return (
        <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
                <Avatar className="h-12 w-12 border-2 border-muted">
                    <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                        {isAI ? <Brain className="h-5 w-5" /> : getInitials(member.full_name)}
                    </AvatarFallback>
                </Avatar>
                {isCentaur && (
                    <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-0.5 border-2 border-background">
                        <Zap className="w-2.5 h-2.5 text-white fill-white" />
                    </div>
                )}
            </div>
            <div>
                <div className="font-bold text-base leading-tight">{member.full_name}</div>
                <Badge 
                    variant="secondary" 
                    className={cn(
                        "mt-2 uppercase text-[10px] tracking-wider font-semibold",
                        getRoleBadgeClass(member.role)
                    )}
                >
                    {member.role}
                </Badge>
            </div>
        </div>
    )
}

/**
 * Section group in comparison table.
 */
function SectionGroup({ 
    sectionName, 
    sectionKeys, 
    members, 
    bestValues 
}: { 
    sectionName: string
    sectionKeys: readonly string[]
    members: TeamMemberForComparison[]
    bestValues: Record<string, { value: number; memberId: string; direction: 'higher' | 'lower' } | null>
}) {
    return (
        <>
            {/* Section header */}
            <tr className="border-t-2 border-border">
                <td colSpan={members.length + 1} className="py-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {sectionName}
                    </span>
                </td>
            </tr>
            {/* Section rows */}
            {sectionKeys.map((key) => (
                <tr key={key} className="border-t border-border/50">
                    <td className="text-sm font-medium text-muted-foreground capitalize py-3 pr-4 align-top sticky left-0 bg-background z-10">
                        {formatAttributeName(key)}
                    </td>
                    {members.map(member => {
                        const value = getMemberValue(member, key)
                        const isBest = bestValues[key]?.memberId === member.id
                        
                        return (
                            <td 
                                key={`${member.id}-${key}`} 
                                className={cn(
                                    "text-sm py-3 px-4 align-top transition-colors",
                                    isBest && "bg-status-success-light"
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    {renderValue(value, key, member, bestValues)}
                                </div>
                            </td>
                        )
                    })}
                </tr>
            ))}
        </>
    )
}

/**
 * Mobile card layout for a member.
 */
function MemberComparisonCard({ 
    member, 
    bestValues 
}: { 
    member: TeamMemberForComparison
    bestValues: Record<string, { value: number; memberId: string; direction: 'higher' | 'lower' } | null>
}) {
    const isAI = member.role === 'AI_Agent'
    const isCentaur = !!member.paired_ai_id
    
    return (
        <Card className="p-4">
            <div className="flex items-start gap-3 mb-4">
                <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12 border-2 border-muted">
                        <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                            {isAI ? <Brain className="h-5 w-5" /> : getInitials(member.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    {isCentaur && (
                        <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-0.5 border-2 border-background">
                            <Zap className="w-2.5 h-2.5 text-white fill-white" />
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="font-semibold text-base">{member.full_name}</h3>
                    <Badge 
                        variant="secondary" 
                        className={cn(
                            "mt-1 uppercase text-[10px] tracking-wider font-semibold",
                            getRoleBadgeClass(member.role)
                        )}
                    >
                        {member.role}
                    </Badge>
                </div>
            </div>
            
            {Object.entries(ATTRIBUTE_SECTIONS).map(([sectionName, sectionKeys]) => (
                <div key={sectionName} className="mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border/50">
                        {sectionName}
                    </h4>
                    <dl className="space-y-2 text-sm">
                        {sectionKeys.map((key) => {
                            const value = getMemberValue(member, key)
                            if (value === undefined || value === null || value === '-') return null
                            const isBest = bestValues[key]?.memberId === member.id
                            
                            return (
                                <div 
                                    key={key} 
                                    className={cn(
                                        "flex justify-between items-start py-1 px-2 rounded-md",
                                        isBest && "bg-status-success-light"
                                    )}
                                >
                                    <dt className="text-muted-foreground capitalize pr-4 flex-shrink-0">
                                        {formatAttributeName(key)}
                                    </dt>
                                    <dd className="text-right flex items-center gap-1.5">
                                        {renderValue(value, key, member, bestValues)}
                                    </dd>
                                </div>
                            )
                        })}
                    </dl>
                </div>
            ))}
        </Card>
    )
}

/**
 * Get the value for a specific attribute from a member.
 */
function getMemberValue(member: TeamMemberForComparison, key: string): string | number | null {
    switch (key) {
        case 'role':
            return member.role
        case 'email':
            return member.email || '-'
        case 'bio':
            return member.bio || '-'
        case 'activeTasks':
            return member.activeTasks
        case 'completedTasks':
            return member.completedTasks
        case 'pendingTasks':
            return member.pendingTasks
        case 'rejectedTasks':
            return member.rejectedTasks
        case 'bandwidth':
            return getBandwidth(member).label
        case 'centaur':
            if (member.role === 'AI_Agent') return 'N/A'
            if (member.paired_ai_id && member.pairedAI?.[0]) {
                return `Paired with ${member.pairedAI[0].full_name}`
            }
            return 'Not paired'
        default:
            return null
    }
}

/**
 * Format attribute key for display.
 */
function formatAttributeName(key: string): string {
    const names: Record<string, string> = {
        role: 'Role',
        email: 'Email',
        bio: 'Bio',
        activeTasks: 'Active Tasks',
        completedTasks: 'Completed',
        pendingTasks: 'Pending',
        rejectedTasks: 'Rejected',
        bandwidth: 'Bandwidth',
        centaur: 'Centaur'
    }
    return names[key] || key.replace(/_/g, ' ')
}

/**
 * Compute best values for highlighting.
 */
function computeBestValues(
    members: TeamMemberForComparison[]
): Record<string, { value: number; memberId: string; direction: 'higher' | 'lower' } | null> {
    const bestValues: Record<string, { value: number; memberId: string; direction: 'higher' | 'lower' } | null> = {}
    
    const numericKeys = ['activeTasks', 'completedTasks', 'pendingTasks', 'rejectedTasks']
    
    for (const key of numericKeys) {
        const values: { value: number; memberId: string }[] = []
        
        for (const member of members) {
            const value = getMemberValue(member, key)
            if (typeof value === 'number') {
                values.push({ value, memberId: member.id })
            }
        }
        
        if (values.length >= 2) {
            const isHigherBetter = HIGHER_IS_BETTER.includes(key)
            const isLowerBetter = LOWER_IS_BETTER.includes(key)
            
            if (isHigherBetter || isLowerBetter) {
                const sorted = [...values].sort((a, b) => 
                    isHigherBetter ? b.value - a.value : a.value - b.value
                )
                
                const best = sorted[0]
                const second = sorted[1]
                
                // Only highlight if there's a meaningful difference
                if (best.value !== second.value) {
                    bestValues[key] = {
                        value: best.value,
                        memberId: best.memberId,
                        direction: isHigherBetter ? 'higher' : 'lower'
                    }
                } else {
                    bestValues[key] = null
                }
            } else {
                bestValues[key] = null
            }
        } else {
            bestValues[key] = null
        }
    }
    
    return bestValues
}

/**
 * Render a value with appropriate formatting and indicators.
 */
function renderValue(
    value: string | number | null,
    key: string,
    member: TeamMemberForComparison,
    bestValues: Record<string, { value: number; memberId: string; direction: 'higher' | 'lower' } | null>
): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground">-</span>
    }
    
    // Special rendering for bandwidth
    if (key === 'bandwidth' && member.role !== 'AI_Agent') {
        const bandwidth = getBandwidth(member)
        return (
            <span className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                bandwidth.className
            )}>
                {bandwidth.label}
            </span>
        )
    }
    
    // Special rendering for centaur status
    if (key === 'centaur') {
        if (member.paired_ai_id && member.pairedAI?.[0]) {
            return (
                <span className="inline-flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-status-warning" />
                    <span className="text-status-warning-dark font-medium">
                        {member.pairedAI[0].full_name}
                    </span>
                </span>
            )
        }
        return <span className="text-muted-foreground">{String(value)}</span>
    }
    
    // Numeric values with trend indicators
    const bestInfo = bestValues[key]
    const isBest = bestInfo?.memberId === member.id
    
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={cn(isBest && "font-semibold text-status-success")}>
                {String(value)}
            </span>
            {isBest && bestInfo && (
                bestInfo.direction === 'higher' 
                    ? <TrendingUp className="w-3.5 h-3.5 text-status-success" />
                    : <TrendingDown className="w-3.5 h-3.5 text-status-success" />
            )}
        </span>
    )
}
