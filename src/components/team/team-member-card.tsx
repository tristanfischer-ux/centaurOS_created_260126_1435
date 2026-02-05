'use client'

import { memo, useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { 
    Brain, Zap, GitCompareArrows, Eye, ChevronDown, ChevronUp,
    Briefcase, MapPin, Clock, CheckCircle2, Calendar, Mail, Phone,
    AlertTriangle, User, MessageSquare, Users
} from "lucide-react"
import { formatDistanceToNow, isPast, parseISO } from "date-fns"
import { PresenceIndicator } from "@/components/PresenceIndicator"

export type CardSize = 'small' | 'medium' | 'full'

interface TaskDetail {
    title: string
    end_date: string | null
    created_at: string
}

interface Member {
    id: string
    full_name: string | null
    email?: string | null
    bio?: string | null
    phone_number?: string | null
    role: string
    activeTasks: number
    completedTasks: number
    pendingTasks: number
    rejectedTasks: number
    paired_ai_id?: string | null
    pairedAI?: { id: string; full_name: string | null; avatar_url: string | null; role: string }[] | null
    taskTitles?: {
        active: string[]
        completed: string[]
        pending: string[]
        rejected: string[]
    }
    taskDetails?: {
        active: TaskDetail[]
        pending: TaskDetail[]
    }
}

interface TeamMemberCardProps {
    member: Member
    isSelected: boolean
    onToggleSelect: (id: string) => void
    size?: CardSize
    onSizeChange?: (id: string, size: CardSize) => void
    onViewProfile?: (id: string) => void
    onMessage?: (id: string) => void
    onAddToTeam?: (id: string) => void
    presenceStatus?: 'online' | 'away' | 'busy' | 'offline'
    presence?: { status: string; last_seen?: string } | null
}

/**
 * Get initials from full name for avatar display.
 */
function getInitials(name: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Get avatar gradient colors based on role.
 * Uses international-orange brand color for human roles,
 * violet for AI agents to distinguish them clearly.
 */
function getAvatarGradient(role: string, name: string | null): string {
    // Use name to generate consistent but varied gradients within role
    const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % 3
    
    switch (role) {
        case 'Founder':
            // Primary brand orange for leadership
            return variant === 0 
                ? 'from-orange-500 to-orange-600' 
                : variant === 1 
                ? 'from-orange-400 to-orange-600'
                : 'from-orange-500 to-amber-600'
        case 'Executive':
            // Warm orange tones
            return variant === 0 
                ? 'from-orange-400 to-orange-500' 
                : variant === 1 
                ? 'from-amber-400 to-orange-500'
                : 'from-orange-400 to-amber-500'
        case 'AI_Agent':
            // Violet distinguishes AI from humans
            return variant === 0 
                ? 'from-violet-500 to-violet-600' 
                : variant === 1 
                ? 'from-violet-400 to-violet-600'
                : 'from-violet-500 to-purple-600'
        case 'Apprentice':
        default:
            // Neutral slate for apprentices
            return variant === 0 
                ? 'from-slate-400 to-slate-500' 
                : variant === 1 
                ? 'from-slate-300 to-slate-500'
                : 'from-slate-400 to-slate-600'
    }
}

/**
 * Role badge styles using brand-consistent colors.
 * Human roles use orange/neutral, AI uses violet for distinction.
 */
const roleBadgeStyles: Record<string, string> = {
    'Founder': 'bg-orange-100 text-orange-700',
    'Executive': 'bg-orange-50 text-orange-600',
    'Apprentice': 'bg-muted text-muted-foreground',
    'AI_Agent': 'bg-violet-100 text-violet-700'
}

/**
 * Calculate bandwidth from task counts.
 * Uses same formula as routing-agent.ts: workloadScore = (active * 20) + (pending * 10)
 */
function getBandwidth(member: Member): { label: string; className: string; score: number } {
    const score = Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
    if (score <= 40) {
        return { label: 'Has capacity', className: 'bg-status-success-light text-status-success-dark', score }
    } else if (score <= 70) {
        return { label: 'At capacity', className: 'bg-status-warning-light text-status-warning-dark', score }
    } else {
        return { label: 'Overloaded', className: 'bg-status-error-light text-status-error-dark', score }
    }
}

/**
 * TeamMemberCard - Displays a team member with marketplace-style card design.
 * 
 * @description Renders a team member card with three size variants (small/medium/full),
 * matching the marketplace listing card pattern. Shows role badge, task metrics,
 * bandwidth status, and agent pairing indicator.
 * 
 * @component
 */
export const TeamMemberCard = memo(function TeamMemberCard({ 
    member, 
    isSelected, 
    onToggleSelect,
    size = 'medium',
    onSizeChange,
    onViewProfile,
    onMessage,
    onAddToTeam,
    presenceStatus = 'offline',
    presence,
}: TeamMemberCardProps) {
    const [isHovered, setIsHovered] = useState(false)
    const [internalSize, setInternalSize] = useState<CardSize>(size)
    
    // Use controlled or uncontrolled size
    const currentSize = onSizeChange ? size : internalSize
    const setSize = useCallback((newSize: CardSize) => {
        if (onSizeChange) {
            onSizeChange(member.id, newSize)
        } else {
            setInternalSize(newSize)
        }
    }, [member.id, onSizeChange])

    const isAI = member.role === 'AI_Agent'
    const isPaired = !!member.paired_ai_id && !!member.pairedAI?.[0]
    const pairedAI = member.pairedAI?.[0]
    const initials = getInitials(member.full_name)
    const avatarGradient = getAvatarGradient(member.role, member.full_name)
    const bandwidth = getBandwidth(member)

    // Get task details for expanded view
    const activeTaskDetails = [...(member.taskDetails?.active || []), ...(member.taskDetails?.pending || [])]
    
    // Cycle through sizes on click (compare is handled by the compare button)
    const handleCardClick = useCallback((e: React.MouseEvent) => {
        // Don't expand if clicking on buttons
        if ((e.target as HTMLElement).closest('button, a')) return
        
        const nextSize: Record<CardSize, CardSize> = {
            'small': 'medium',
            'medium': 'full',
            'full': 'small'
        }
        setSize(nextSize[currentSize])
    }, [currentSize, setSize])
    
    // Size indicator button
    const handleSizeToggle = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        const nextSize: Record<CardSize, CardSize> = {
            'small': 'medium',
            'medium': 'full',
            'full': 'small'
        }
        setSize(nextSize[currentSize])
    }, [currentSize, setSize])

    return (
        <Card 
            className={cn(
                "group relative flex flex-col border hover:border-orange-300 hover:shadow-md transition-all duration-200 overflow-hidden bg-background cursor-pointer",
                isSelected && "ring-2 ring-orange-500 border-orange-500",
                currentSize === 'full' && "col-span-1 md:col-span-2",
                isPaired && "border-status-warning/50"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleCardClick}
        >
            {/* Action buttons - top right */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                {/* Compare button */}
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleSelect(member.id)
                    }}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                        isSelected 
                            ? "bg-orange-500 text-white shadow-md" 
                            : isHovered 
                                ? "bg-background text-muted-foreground shadow-md border opacity-100"
                                : "opacity-0 group-hover:opacity-100"
                    )}
                    title={isSelected ? "Remove from comparison" : "Add to comparison"}
                >
                    <GitCompareArrows className="w-4 h-4" />
                </button>
            </div>

            <CardContent className={cn(
                "flex flex-col flex-1 transition-all duration-200",
                currentSize === 'small' ? "p-3" : "p-4"
            )}>
                {/* === SMALL SIZE: Compact view === */}
                {currentSize === 'small' && (
                    <>
                        <div className="flex items-center gap-3 pr-12">
                            {/* Avatar */}
                            <div className="relative">
                                <div className={cn(
                                    "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow-sm",
                                    avatarGradient
                                )}>
                                    {isAI ? (
                                        <Brain className="w-5 h-5" />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                {!isAI && (
                                    <PresenceIndicator
                                        status={presenceStatus}
                                        presence={presence}
                                        size="sm"
                                    />
                                )}
                                {isPaired && (
                                    <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-0.5">
                                        <Zap className="w-2 h-2 text-white fill-white" />
                                    </div>
                                )}
                            </div>

                            {/* Title + Badge */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Badge variant="secondary" className={cn("uppercase text-[9px] tracking-wider font-semibold border-0 shrink-0 px-1.5 py-0", roleBadgeStyles[member.role])}>
                                        {member.role.replace('_', ' ')}
                                    </Badge>
                                    {isPaired && (
                                        <Badge variant="secondary" className="text-[9px] bg-status-warning-light text-status-warning-dark border-0 px-1.5 py-0">
                                            Paired
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="text-sm font-bold tracking-tight text-foreground truncate">
                                    {member.full_name}
                                </h3>
                            </div>

                            {/* Bandwidth */}
                            <div className="text-right shrink-0">
                                {!isAI && (
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", bandwidth.className)}>
                                        {bandwidth.label}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {/* Expand indicator */}
                        <div className="flex justify-center mt-2 pt-2 border-t border-muted">
                            <button
                                onClick={handleSizeToggle}
                                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                                <ChevronDown className="w-3 h-3" />
                                More info
                            </button>
                        </div>
                    </>
                )}

                {/* === MEDIUM SIZE: Standard view === */}
                {currentSize === 'medium' && (
                    <>
                        {/* Avatar + Header Row */}
                        <div className="flex gap-3 mb-3 pr-12">
                            <div className="relative">
                                <div className={cn(
                                    "w-12 h-12 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-sm",
                                    avatarGradient
                                )}>
                                    {isAI ? (
                                        <Brain className="w-6 h-6" />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                {!isAI && (
                                    <PresenceIndicator
                                        status={presenceStatus}
                                        presence={presence}
                                        size="sm"
                                    />
                                )}
                                {isPaired && (
                                    <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-0.5 border border-background">
                                        <Zap className="w-2.5 h-2.5 text-white fill-white" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", roleBadgeStyles[member.role])}>
                                        {member.role.replace('_', ' ')}
                                    </Badge>
                                    {isPaired && (
                                        <Badge variant="secondary" className="text-[10px] bg-status-warning-light text-status-warning-dark border-0">
                                            <Zap className="w-2.5 h-2.5 mr-0.5" />
                                            Paired
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="text-base font-bold tracking-tight text-foreground truncate">
                                    {member.full_name}
                                </h3>
                            </div>
                        </div>

                        {/* Bio/Email subtitle */}
                        {member.email && (
                            <p className="text-sm text-muted-foreground mb-2 truncate flex items-center gap-1.5">
                                <Mail className="w-3 h-3" />
                                {member.email}
                            </p>
                        )}

                        {/* Key metrics row with Add to Team button */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-status-success" />
                                    {member.completedTasks} done
                                </span>
                                <span className="flex items-center gap-1">
                                    <Briefcase className="w-3 h-3 text-electric-blue" />
                                    {member.activeTasks} active
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {member.pendingTasks} pending
                                </span>
                            </div>
                            {onAddToTeam && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onAddToTeam(member.id)
                                    }}
                                    className="h-7 text-xs shrink-0"
                                >
                                    <Users className="w-3 h-3 mr-1" />
                                    Add to Team
                                </Button>
                            )}
                        </div>

                        {/* Agent pairing info */}
                        {isPaired && pairedAI && (
                            <div className="flex items-center gap-1.5 mb-3">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-warning-light text-status-warning-dark flex items-center gap-1">
                                    <Brain className="w-3 h-3" />
                                    Paired with {pairedAI.full_name}
                                </span>
                            </div>
                        )}

                        {/* Bandwidth indicator */}
                        {!isAI && (
                            <div className="flex flex-wrap gap-1 mb-3">
                                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", bandwidth.className)}>
                                    {bandwidth.label}
                                </span>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-muted mt-auto">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {member.activeTasks + member.pendingTasks} tasks in queue
                                </span>
                                <button
                                    onClick={handleSizeToggle}
                                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors ml-2"
                                >
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                            </div>
                            
                            <Button 
                                size="sm" 
                                variant="default"
                                className="h-8 text-xs shadow-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onViewProfile?.(member.id)
                                }}
                            >
                                <Eye className="w-3 h-3 mr-1" />
                                View
                            </Button>
                        </div>
                    </>
                )}

                {/* === FULL SIZE: Expanded detailed view === */}
                {currentSize === 'full' && (
                    <>
                        {/* Avatar + Header Row - Larger */}
                        <div className="flex gap-4 mb-4 pr-12">
                            <div className="relative">
                                <div className={cn(
                                    "w-16 h-16 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm",
                                    avatarGradient
                                )}>
                                    {isAI ? (
                                        <Brain className="w-8 h-8" />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                {!isAI && (
                                    <PresenceIndicator
                                        status={presenceStatus}
                                        presence={presence}
                                        size="md"
                                    />
                                )}
                                {isPaired && (
                                    <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-1 border-2 border-background">
                                        <Zap className="w-3 h-3 text-white fill-white" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="secondary" className={cn("uppercase text-[10px] tracking-wider font-semibold border-0 shrink-0", roleBadgeStyles[member.role])}>
                                        {member.role.replace('_', ' ')}
                                    </Badge>
                                    {isPaired && (
                                        <Badge variant="secondary" className="text-[10px] bg-status-warning-light text-status-warning-dark border-0">
                                            <Zap className="w-2.5 h-2.5 mr-0.5" />
                                            Paired
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold tracking-tight text-foreground">
                                    {member.full_name}
                                </h3>
                                {member.email && (
                                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                                        <Mail className="w-3 h-3" />
                                        {member.email}
                                    </p>
                                )}
                            </div>
                            
                            {/* Bandwidth badge in header */}
                            <div className="text-right shrink-0">
                                {!isAI && (
                                    <span className={cn("text-xs px-2.5 py-1 rounded font-medium", bandwidth.className)}>
                                        {bandwidth.label}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Bio */}
                        {member.bio && (
                            <p className="text-sm text-muted-foreground mb-4 italic bg-muted p-3 rounded-lg">
                                {member.bio}
                            </p>
                        )}

                        {/* Detailed Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-status-success" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Completed</p>
                                    <p className="text-sm font-medium text-foreground">{member.completedTasks} tasks</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-electric-blue" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Active</p>
                                    <p className="text-sm font-medium text-foreground">{member.activeTasks} tasks</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Pending</p>
                                    <p className="text-sm font-medium text-foreground">{member.pendingTasks} tasks</p>
                                </div>
                            </div>
                            {member.phone_number && (
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Phone</p>
                                        <p className="text-sm font-medium text-foreground">{member.phone_number}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Agent Pairing Info */}
                        {isPaired && pairedAI && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <Zap className="w-3 h-3 text-status-warning" />
                                    Agent Pairing
                                </p>
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-status-warning-light border border-status-warning/20">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                        <Brain className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-status-warning-dark">{pairedAI.full_name}</p>
                                        <p className="text-xs text-status-warning-dark/70">AI Partner</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Current Tasks */}
                        {activeTaskDetails.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <Briefcase className="w-3 h-3" />
                                    Current Tasks
                                </p>
                                <div className="space-y-2">
                                    {activeTaskDetails.slice(0, 3).map((task, idx) => {
                                        const isOverdue = task.end_date ? isPast(parseISO(task.end_date)) : false
                                        const hasDeadline = !!task.end_date
                                        
                                        return (
                                            <div key={idx} className={cn(
                                                "flex items-center justify-between text-xs p-2 rounded border",
                                                isOverdue ? "bg-destructive/10 border-destructive/30" : "bg-muted border-muted"
                                            )}>
                                                <span className="truncate text-foreground font-medium flex-1 mr-2">{task.title}</span>
                                                {hasDeadline && (
                                                    <span className={cn(
                                                        "flex items-center gap-1 shrink-0",
                                                        isOverdue ? "text-destructive" : "text-muted-foreground"
                                                    )}>
                                                        {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                                                        <span>
                                                            {formatDistanceToNow(parseISO(task.end_date!), { addSuffix: true })}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {activeTaskDetails.length > 3 && (
                                        <p className="text-xs text-muted-foreground text-center">
                                            +{activeTaskDetails.length - 3} more tasks
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer with actions */}
                        <div className="flex items-center justify-between pt-4 border-t border-muted mt-auto">
                            <button
                                onClick={handleSizeToggle}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                                <ChevronUp className="w-4 h-4" />
                                Show less
                            </button>
                            
                            <div className="flex items-center gap-2">
                                {!isAI && onMessage && (
                                    <Button 
                                        size="sm" 
                                        variant="secondary"
                                        className="h-8 text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onMessage(member.id)
                                        }}
                                    >
                                        <MessageSquare className="w-3 h-3 mr-1" />
                                        Message
                                    </Button>
                                )}
                                <Button 
                                    size="sm" 
                                    variant="default"
                                    className="h-8 text-xs shadow-sm"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onViewProfile?.(member.id)
                                    }}
                                >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View Details
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
})
