"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import {
    ArrowLeft, Search, Users, Check, X, Brain,
    Activity, Briefcase, Loader2, AlertCircle, Sparkles
} from "lucide-react"
import { createTeam } from "@/actions/team"
import { toast } from "sonner"


// ─── Types ───────────────────────────────────────

interface MemberWithMetrics {
    id: string
    full_name: string
    role: string
    avatar_url: string | null
    bio: string | null
    activeTasks: number
    completedTasks: number
    pendingTasks: number
}

interface NewTeamFormProps {
    members: MemberWithMetrics[]
}


// ─── Helpers ─────────────────────────────────────

function getBandwidthInfo(member: MemberWithMetrics) {
    const score = Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
    if (score <= 40) return { label: 'Available', color: 'text-status-success', bg: 'bg-status-success-light', dot: 'bg-status-success' }
    if (score <= 70) return { label: 'Busy', color: 'text-status-warning-dark', bg: 'bg-status-warning-light', dot: 'bg-status-warning' }
    return { label: 'Overloaded', color: 'text-status-error-dark', bg: 'bg-status-error-light', dot: 'bg-status-error' }
}

function getRoleConfig(role: string) {
    switch (role) {
        case 'Founder': return { color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-200' }
        case 'Executive': return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' }
        case 'AI_Agent': return { color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-200' }
        default: return { color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-muted' }
    }
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}


// ─── Component ───────────────────────────────────

export function NewTeamForm({ members }: NewTeamFormProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Form state
    const [teamName, setTeamName] = useState("")
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")
    const [roleFilter, setRoleFilter] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Derived
    const selectedMembers = members.filter(m => selectedIds.has(m.id))

    // Filter members
    const filteredMembers = useMemo(() => {
        let filtered = members
        if (roleFilter) {
            filtered = filtered.filter(m => m.role === roleFilter)
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            filtered = filtered.filter(m =>
                m.full_name.toLowerCase().includes(q) ||
                m.role.toLowerCase().includes(q)
            )
        }
        return filtered
    }, [members, roleFilter, searchQuery])

    // Grouped by role for display
    const groupedMembers = useMemo(() => {
        const groups: Record<string, MemberWithMetrics[]> = {}
        for (const member of filteredMembers) {
            const role = member.role || 'Apprentice'
            if (!groups[role]) groups[role] = []
            groups[role].push(member)
        }
        return groups
    }, [filteredMembers])

    const roleOrder = ['Founder', 'Executive', 'Apprentice', 'AI_Agent']
    const sortedRoles = Object.keys(groupedMembers).sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))

    // Role counts for filter
    const roleCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const member of members) {
            counts[member.role] = (counts[member.role] || 0) + 1
        }
        return counts
    }, [members])

    // Toggle member selection
    const toggleMember = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Create team
    const handleCreate = () => {
        if (!teamName.trim()) {
            setError("Give your team a name")
            return
        }
        if (selectedIds.size < 2) {
            setError("Select at least 2 members")
            return
        }
        setError(null)

        startTransition(async () => {
            const result = await createTeam(teamName.trim(), Array.from(selectedIds))
            if (result.error) {
                setError(result.error)
            } else {
                toast.success(`Team "${teamName}" created with ${selectedIds.size} members`)
                router.push('/team')
            }
        })
    }

    const isValid = teamName.trim().length > 0 && selectedIds.size >= 2


    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* ─── Back Link ──────────────────────── */}
            <Link
                href="/team"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to Team
            </Link>

            {/* ─── Header ─────────────────────────── */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                        New Team
                    </h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                    Bring the right people together for a specific mission
                </p>
            </div>

            {/* ─── Main Layout ────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: Form + Member Selection ── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Team Name */}
                    <Card className="border shadow-sm overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-international-orange via-international-orange/60 to-transparent" />
                        <CardContent className="p-5 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="team-name" className="text-sm font-medium">
                                    Team Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="team-name"
                                    placeholder="e.g., Growth Squad, Alpha Team, Frontend Crew..."
                                    value={teamName}
                                    onChange={(e) => { setTeamName(e.target.value); setError(null) }}
                                    className="h-11 text-base"
                                    autoFocus
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Member Selection */}
                    <Card className="border shadow-sm">
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-display font-semibold text-foreground">Select Members</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">Choose at least 2 people for your team</p>
                                </div>
                                {selectedIds.size > 0 && (
                                    <Badge className="bg-international-orange/10 text-international-orange border-international-orange/20">
                                        {selectedIds.size} selected
                                    </Badge>
                                )}
                            </div>

                            {/* Search & Filter Bar */}
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 h-9 text-sm"
                                    />
                                </div>
                                <div className="flex gap-1.5 flex-wrap">
                                    <button
                                        onClick={() => setRoleFilter(null)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                            !roleFilter
                                                ? "bg-foreground text-background border-foreground"
                                                : "bg-background text-muted-foreground border-muted hover:border-foreground/20 hover:text-foreground"
                                        )}
                                    >
                                        All ({members.length})
                                    </button>
                                    {roleOrder.filter(r => roleCounts[r]).map(role => {
                                        const config = getRoleConfig(role)
                                        return (
                                            <button
                                                key={role}
                                                onClick={() => setRoleFilter(roleFilter === role ? null : role)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                                    roleFilter === role
                                                        ? cn(config.bg, config.color, config.border)
                                                        : "bg-background text-muted-foreground border-muted hover:border-foreground/20 hover:text-foreground"
                                                )}
                                            >
                                                {role === 'AI_Agent' ? 'AI' : role}s ({roleCounts[role]})
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Member Grid */}
                            {filteredMembers.length === 0 ? (
                                <div className="py-12 text-center text-muted-foreground">
                                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">
                                        {searchQuery ? `No members match "${searchQuery}"` : 'No members in this role'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {sortedRoles.map(role => (
                                        <div key={role} className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-1 h-4 rounded-full",
                                                    role === 'Founder' ? 'bg-international-orange' :
                                                    role === 'Executive' ? 'bg-orange-400' :
                                                    role === 'AI_Agent' ? 'bg-purple-500' : 'bg-slate-400'
                                                )} />
                                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                    {role === 'AI_Agent' ? 'AI Agents' : `${role}s`}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {groupedMembers[role].map(member => {
                                                    const isSelected = selectedIds.has(member.id)
                                                    const bandwidth = getBandwidthInfo(member)
                                                    const isAI = member.role === 'AI_Agent'

                                                    return (
                                                        <button
                                                            key={member.id}
                                                            type="button"
                                                            onClick={() => toggleMember(member.id)}
                                                            className={cn(
                                                                "flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full group/item",
                                                                isSelected
                                                                    ? "bg-international-orange/5 border-international-orange/30 ring-1 ring-international-orange/20"
                                                                    : "bg-background border-muted hover:border-muted-foreground/20 hover:bg-muted/30"
                                                            )}
                                                        >
                                                            {/* Selection indicator */}
                                                            <div className={cn(
                                                                "h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all",
                                                                isSelected
                                                                    ? "bg-international-orange text-white"
                                                                    : "border-2 border-muted group-hover/item:border-muted-foreground/30"
                                                            )}>
                                                                {isSelected && <Check className="h-3 w-3" />}
                                                            </div>

                                                            {/* Avatar */}
                                                            {isAI ? (
                                                                <Avatar className="h-9 w-9 shrink-0">
                                                                    <AvatarFallback className="bg-purple-100 text-purple-600 text-xs">
                                                                        <Brain className="h-4 w-4" />
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                            ) : (
                                                                <UserAvatar
                                                                    name={member.full_name}
                                                                    role={member.role}
                                                                    size="sm"
                                                                />
                                                            )}

                                                            {/* Info */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-sm text-foreground truncate">
                                                                        {member.full_name}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    {!isAI && (
                                                                        <span className={cn(
                                                                            "text-[10px] font-medium flex items-center gap-1",
                                                                            bandwidth.color
                                                                        )}>
                                                                            <span className={cn("h-1.5 w-1.5 rounded-full", bandwidth.dot)} />
                                                                            {bandwidth.label}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {member.activeTasks} active &middot; {member.completedTasks} done
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Right: Team Preview ───────────── */}
                <div className="lg:col-span-1">
                    <div className="sticky top-6 space-y-4">
                        <Card className="border shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-electric-blue via-electric-blue/60 to-transparent" />
                            <CardContent className="p-5 space-y-4">
                                <h2 className="text-base font-display font-semibold text-foreground">Team Preview</h2>

                                {/* Team name preview */}
                                <div className="bg-muted/50 rounded-xl p-4 text-center">
                                    {teamName.trim() ? (
                                        <p className="text-lg font-display font-semibold text-foreground">{teamName}</p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground italic">Enter a team name...</p>
                                    )}
                                </div>

                                {/* Selected members */}
                                {selectedMembers.length === 0 ? (
                                    <div className="py-8 text-center">
                                        <div className="h-12 w-12 rounded-full bg-muted/50 mx-auto flex items-center justify-center mb-3">
                                            <Users className="h-6 w-6 text-muted-foreground/40" />
                                        </div>
                                        <p className="text-sm text-muted-foreground">No members selected yet</p>
                                        <p className="text-xs text-muted-foreground mt-1">Click on people to add them</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Avatar stack */}
                                        <div className="flex justify-center -space-x-3 py-2">
                                            {selectedMembers.slice(0, 6).map(member => (
                                                member.role === 'AI_Agent' ? (
                                                    <Avatar key={member.id} className="h-10 w-10 border-2 border-background">
                                                        <AvatarFallback className="bg-purple-100 text-purple-600 text-xs">
                                                            <Brain className="h-4 w-4" />
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ) : (
                                                    <UserAvatar
                                                        key={member.id}
                                                        name={member.full_name}
                                                        role={member.role}
                                                        size="md"
                                                        className="border-2 border-background"
                                                    />
                                                )
                                            ))}
                                            {selectedMembers.length > 6 && (
                                                <div className="h-10 w-10 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium text-muted-foreground">
                                                    +{selectedMembers.length - 6}
                                                </div>
                                            )}
                                        </div>

                                        {/* Member list */}
                                        <div className="space-y-1 max-h-64 overflow-y-auto">
                                            {selectedMembers.map(member => {
                                                const roleConfig = getRoleConfig(member.role)
                                                return (
                                                    <div
                                                        key={member.id}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 group/selected"
                                                    >
                                                        {member.role === 'AI_Agent' ? (
                                                            <Avatar className="h-6 w-6">
                                                                <AvatarFallback className="bg-purple-100 text-purple-600 text-[8px]">
                                                                    <Brain className="h-3 w-3" />
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        ) : (
                                                            <UserAvatar name={member.full_name} role={member.role} size="xs" />
                                                        )}
                                                        <span className="text-sm text-foreground truncate flex-1">{member.full_name}</span>
                                                        <Badge variant="secondary" className={cn("text-[9px] px-1.5 h-4", roleConfig.bg, roleConfig.color, roleConfig.border)}>
                                                            {member.role === 'AI_Agent' ? 'AI' : member.role}
                                                        </Badge>
                                                        <button
                                                            onClick={() => toggleMember(member.id)}
                                                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover/selected:opacity-100 transition-all p-0.5"
                                                            aria-label={`Remove ${member.full_name}`}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Role breakdown */}
                                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-muted">
                                            {Object.entries(
                                                selectedMembers.reduce((acc, m) => {
                                                    acc[m.role] = (acc[m.role] || 0) + 1
                                                    return acc
                                                }, {} as Record<string, number>)
                                            ).map(([role, count]) => {
                                                const config = getRoleConfig(role)
                                                return (
                                                    <Badge key={role} variant="secondary" className={cn("text-[10px]", config.bg, config.color, config.border)}>
                                                        {count} {role === 'AI_Agent' ? 'AI' : role}{count > 1 ? 's' : ''}
                                                    </Badge>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                        {error}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <Link href="/team" className="flex-1">
                                        <Button variant="secondary" className="w-full" disabled={isPending}>
                                            Cancel
                                        </Button>
                                    </Link>
                                    <Button
                                        onClick={handleCreate}
                                        disabled={isPending || !isValid}
                                        className={cn(
                                            "flex-1 transition-all",
                                            isValid
                                                ? "bg-international-orange hover:bg-international-orange/90 text-white shadow-md hover:shadow-lg"
                                                : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {isPending ? (
                                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
                                        ) : (
                                            <><Sparkles className="h-4 w-4 mr-2" />Create Team</>
                                        )}
                                    </Button>
                                </div>

                                {/* Validation hints */}
                                <div className="space-y-1">
                                    <div className={cn(
                                        "flex items-center gap-2 text-xs transition-colors",
                                        teamName.trim() ? "text-status-success" : "text-muted-foreground"
                                    )}>
                                        <div className={cn(
                                            "h-4 w-4 rounded-full flex items-center justify-center text-[10px]",
                                            teamName.trim() ? "bg-status-success text-white" : "border border-muted"
                                        )}>
                                            {teamName.trim() && <Check className="h-2.5 w-2.5" />}
                                        </div>
                                        Team name provided
                                    </div>
                                    <div className={cn(
                                        "flex items-center gap-2 text-xs transition-colors",
                                        selectedIds.size >= 2 ? "text-status-success" : "text-muted-foreground"
                                    )}>
                                        <div className={cn(
                                            "h-4 w-4 rounded-full flex items-center justify-center text-[10px]",
                                            selectedIds.size >= 2 ? "bg-status-success text-white" : "border border-muted"
                                        )}>
                                            {selectedIds.size >= 2 && <Check className="h-2.5 w-2.5" />}
                                        </div>
                                        At least 2 members selected ({selectedIds.size})
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    )
}
