'use client'

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, GitCompare, User, Brain, Zap } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface TeamMemberForComparison {
    id: string
    full_name: string | null
    role: string
    activeTasks: number
    paired_ai_id?: string | null
}

interface TeamComparisonBarProps {
    selectedMembers: TeamMemberForComparison[]
    onClear: () => void
    onCompare: () => void
    onRemove: (id: string) => void
}

/**
 * Get role color classes for visual distinction using semantic tokens.
 * 
 * @param role - The member's role (Founder, Executive, Apprentice, AI_Agent)
 * @returns Tailwind color classes for the chip
 */
function getRoleColors(role: string): string {
    switch (role) {
        case 'Founder': return 'bg-accent/10 text-accent border-accent/30'
        case 'Executive': return 'bg-status-warning-light text-status-warning-dark border-status-warning-light'
        case 'AI_Agent': return 'bg-status-info-light text-status-info-dark border-status-info-light'
        case 'Apprentice': 
        default: return 'bg-electric-blue-light text-electric-blue border-electric-blue-light'
    }
}

/**
 * Get initials from full name for avatar display.
 * 
 * @param name - The full name to extract initials from
 * @returns Uppercase initials (e.g., "JD" for "John Doe")
 */
function getInitials(name: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * TeamComparisonBar - Floating bottom bar for selecting team members to compare.
 * 
 * @description Shows selected members as chips with remove buttons. Appears
 * fixed at the bottom of the screen when members are selected for comparison.
 * Matches the marketplace comparison bar look and feel.
 * 
 * @component
 * 
 * @example
 * <TeamComparisonBar
 *   selectedMembers={selectedMembers}
 *   onClear={() => setSelectedIds(new Set())}
 *   onCompare={() => setShowComparison(true)}
 *   onRemove={(id) => removeFromSelection(id)}
 * />
 */
export function TeamComparisonBar({ 
    selectedMembers, 
    onClear, 
    onCompare, 
    onRemove 
}: TeamComparisonBarProps) {
    if (selectedMembers.length === 0) return null

    return (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-10 fade-in duration-300 w-full max-w-4xl px-4 pointer-events-none">
            <Card className="shadow-xl bg-background border-t-2 border-t-international-orange pointer-events-auto">
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                        <GitCompare className="w-4 h-4 text-international-orange" />
                        <span className="text-sm font-medium text-foreground">
                            Comparing {selectedMembers.length} item{selectedMembers.length !== 1 && 's'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={onClear} 
                            className="text-muted-foreground hover:text-foreground text-xs h-8 px-3"
                        >
                            Clear all
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            onClick={onCompare}
                            className="h-8 px-4"
                            disabled={selectedMembers.length < 2}
                        >
                            Compare
                        </Button>
                    </div>
                </div>
                
                {/* Selected items row - horizontal scroll */}
                <div className="px-4 py-3 overflow-x-auto">
                    <div className="flex gap-3 min-w-min">
                        {selectedMembers.map(member => {
                            const colorClasses = getRoleColors(member.role)
                            const isAI = member.role === 'AI_Agent'
                            const isCentaur = !!member.paired_ai_id
                            
                            return (
                                <div 
                                    key={member.id} 
                                    className={cn(
                                        "relative group flex items-center gap-3 px-3 py-2 rounded-lg border min-w-[200px] max-w-[280px]",
                                        colorClasses
                                    )}
                                >
                                    {/* Avatar with role icon */}
                                    <div className="flex-shrink-0 w-8 h-8 rounded-md bg-background flex items-center justify-center relative">
                                        {isAI ? (
                                            <Brain className="w-4 h-4" />
                                        ) : (
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="bg-transparent text-xs font-medium">
                                                    {getInitials(member.full_name)}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}
                                        {isCentaur && (
                                            <div className="absolute -bottom-1 -right-1 bg-status-warning rounded-full p-0.5">
                                                <Zap className="w-2 h-2 text-white fill-white" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" title={member.full_name || 'Unknown'}>
                                            {member.full_name || 'Unknown'}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs opacity-80">
                                            <span>{member.role}</span>
                                            {member.activeTasks > 0 && (
                                                <>
                                                    <span className="opacity-50">•</span>
                                                    <span>{member.activeTasks} active</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Remove button */}
                                    <button
                                        onClick={() => onRemove(member.id)}
                                        aria-label={`Remove ${member.full_name} from comparison`}
                                        className="flex-shrink-0 w-6 h-6 rounded-full bg-background hover:bg-destructive hover:text-white flex items-center justify-center transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </Card>
        </div>
    )
}
