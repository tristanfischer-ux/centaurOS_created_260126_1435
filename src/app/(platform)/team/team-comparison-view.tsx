"use client"

import { useState, useTransition } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { RefreshButton } from "@/components/RefreshButton"
import { formatDistanceToNow, isPast, parseISO } from "date-fns"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Check, X, GitCompare, Users, MoreHorizontal, Pencil, Trash2, Loader2, AlertTriangle, Mail, Phone, LayoutGrid, List, ChevronUp, ChevronDown, User, Calendar, Clock, CheckCircle2 } from "lucide-react"
import { createTeam, addTeamMember, deleteMember } from "@/actions/team"
import { deleteTeam, updateTeamName } from "@/actions/teams"
import Link from "next/link"
import { CreateTeamDialog } from "./create-team-dialog"
import { InviteMemberDialog } from "./invite-member-dialog"
import { PendingInvitations } from "./pending-invitations"
import { FeatureTip } from "@/components/onboarding"
import { pairCentaur, unpairCentaur } from "@/actions/team"
import { Brain, Unplug, Zap } from "lucide-react"
import { toast } from "sonner"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { usePresenceContext } from "@/components/PresenceProvider"
import { PresenceIndicator } from "@/components/PresenceIndicator"
import { cn } from "@/lib/utils"


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
    pairedAI?: { id: string, full_name: string | null, avatar_url: string | null, role: string }[] | null
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

interface TeamMember {
    id: string
    full_name: string | null
    role: string | null
    email?: string | null
}

interface Team {
    id: string
    name: string
    is_auto_generated: boolean | null
    created_at: string | null
    members: TeamMember[]
}

interface TeamComparisonViewProps {
    founders: Member[]
    executives: Member[]
    apprentices: Member[]
    aiAgents: Member[]
    teams: Team[]
}

export function TeamComparisonView({ founders, executives, apprentices, aiAgents, teams }: TeamComparisonViewProps) {
    const [compareMode, setCompareMode] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showComparison, setShowComparison] = useState(false)

    // Drag-and-drop team creation state
    const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)
    const [showQuickTeamDialog, setShowQuickTeamDialog] = useState(false)
    const [quickTeamMemberIds, setQuickTeamMemberIds] = useState<string[]>([])
    const [teamName, setTeamName] = useState("")
    const [teamError, setTeamError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [pairingMemberId, setPairingMemberId] = useState<string | null>(null)
    const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)

    // Edit/Delete Team State
    const [teamToEdit, setTeamToEdit] = useState<{ id: string, name: string } | null>(null)
    const [teamToDelete, setTeamToDelete] = useState<string | null>(null)
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [newName, setNewName] = useState("")

    // Presence tracking for remote team visibility
    const { getPresenceForUser, teamPresence } = usePresenceContext()

    // Auto-refresh using Supabase Realtime
    useAutoRefresh({ tables: ['profiles', 'teams', 'presence'] })

    const allMembers = [...founders, ...executives, ...apprentices, ...aiAgents]
    const selectedMembers = allMembers.filter(m => selectedIds.has(m.id))
    const quickTeamMembers = allMembers.filter(m => quickTeamMemberIds.includes(m.id))

    // Helper: get initials from full name
    const getInitials = (name: string | null) => {
        if (!name) return '?'
        const parts = name.trim().split(/\s+/)
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else if (newSet.size < 4) {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const toggleCompareMode = () => {
        if (compareMode) {
            setSelectedIds(new Set())
        }
        setCompareMode(!compareMode)
    }

    // Drag-and-drop handlers
    const handleDragStart = (e: React.DragEvent, memberId: string) => {
        setDraggedMemberId(memberId)
        // Use text/plain for Safari compatibility
        e.dataTransfer.setData('text/plain', memberId)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, memberId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        // Get the dragged ID from dataTransfer for Safari
        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== memberId) {
            setDropTargetId(memberId)
        }
    }

    const handleDragLeave = () => {
        setDropTargetId(null)
    }

    const handleDrop = (e: React.DragEvent, targetMemberId: string) => {
        e.preventDefault()
        // Get the dragged ID from dataTransfer (more reliable for Safari)
        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId

        // --- Centaur Pairing Logic ---
        const draggedMember = allMembers.find(m => m.id === draggedId)
        const targetMember = allMembers.find(m => m.id === targetMemberId)

        if (draggedMember && targetMember) {
            // Case 1: Dragging AI onto Human
            if (draggedMember.role === 'AI_Agent' && targetMember.role !== 'AI_Agent') {
                setPairingMemberId(targetMember.id)
                startTransition(async () => {
                    const res = await pairCentaur(targetMember.id, draggedMember.id)
                    if (res?.error) {
                        toast.error(res.error)
                    } else {
                        toast.success(`Paired ${targetMember.full_name} with ${draggedMember.full_name}`)
                    }
                    setPairingMemberId(null)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
            // Case 2: Dragging Human onto AI
            if (draggedMember.role !== 'AI_Agent' && targetMember.role === 'AI_Agent') {
                setPairingMemberId(draggedMember.id)
                startTransition(async () => {
                    const res = await pairCentaur(draggedMember.id, targetMember.id)
                    if (res?.error) {
                        toast.error(res.error)
                    } else {
                        toast.success(`Paired ${draggedMember.full_name} with ${targetMember.full_name}`)
                    }
                    setPairingMemberId(null)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
        }

        if (draggedId && draggedId !== targetMemberId) {
            // Open quick team creation dialog with both members
            setQuickTeamMemberIds([draggedId, targetMemberId])
            setTeamName("")
            setTeamError(null)
            setShowQuickTeamDialog(true)
        }
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    const handleDragEnd = () => {
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    const handleUpdateName = async () => {
        if (!teamToEdit || !newName.trim()) return

        startTransition(async () => {
            try {
                await updateTeamName(teamToEdit.id, newName)
                setTeamToEdit(null)
                setNewName("")
            } catch (error) {
                console.error(error)
            }
        })
    }

    const handleDeleteTeam = async () => {
        if (!teamToDelete) return
        startTransition(async () => {
            const result = await deleteTeam(teamToDelete)
            if (result?.error) {
                toast.error(result.error)
            } else {
                setTeamToDelete(null)
            }
        })
    }

    const handleDeleteMember = async () => {
        if (!memberToDelete) return

        setDeletingMemberId(memberToDelete)
        startTransition(async () => {
            const res = await deleteMember(memberToDelete)
            if (res?.error) {
                toast.error(res.error)
            } else {
                toast.success("Member removed")
                setMemberToDelete(null)
            }
            setDeletingMemberId(null)
        })
    }

    const handleCreateQuickTeam = () => {
        if (!teamName.trim()) {
            setTeamError("Team name is required")
            return
        }
        setTeamError(null)
        startTransition(async () => {
            const result = await createTeam(teamName.trim(), quickTeamMemberIds)
            if (result.error) {
                setTeamError(result.error)
            } else {
                setShowQuickTeamDialog(false)
                setQuickTeamMemberIds([])
                setTeamName("")
            }
        })
    }

    // Comparison attribute rows
    const comparisonRows = [
        { label: "Role", getValue: (m: Member) => m.role },
        { label: "Email", getValue: (m: Member) => m.email || "-" },
        { label: "Active Tasks", getValue: (m: Member) => m.activeTasks, highlight: true },
        { label: "Completed", getValue: (m: Member) => m.completedTasks, highlight: true, good: true },
        { label: "Pending", getValue: (m: Member) => m.pendingTasks },
        { label: "Rejected", getValue: (m: Member) => m.rejectedTasks, caution: true },
    ]

    // Track expanded member cards
    const [expandedMemberIds, setExpandedMemberIds] = useState<Set<string>>(new Set())
    
    const toggleMemberExpand = (memberId: string) => {
        setExpandedMemberIds(prev => {
            const next = new Set(prev)
            if (next.has(memberId)) {
                next.delete(memberId)
            } else {
                next.add(memberId)
            }
            return next
        })
    }

    const MemberCard = ({ member, type }: { member: Member, type: 'founder' | 'executive' | 'apprentice' | 'ai_agent' }) => {
        const isSelected = selectedIds.has(member.id)
        const isFounder = type === 'founder'
        const isExecutive = type === 'executive'
        const isAIAgent = type === 'ai_agent'
        const isDragging = draggedMemberId === member.id
        const isDropTarget = dropTargetId === member.id && draggedMemberId !== member.id
        const isPairing = pairingMemberId === member.id
        const isDeleting = deletingMemberId === member.id
        const isExpanded = expandedMemberIds.has(member.id)

        // Centaur Status
        const pairedAI = member.pairedAI?.[0]
        const isCentaur = !!member.paired_ai_id && !!pairedAI

        // Get member's current task details from pre-computed data
        const activeTaskDetails = [...(member.taskDetails?.active || []), ...(member.taskDetails?.pending || [])]

        // Determine styles based on type
        let accentColor = 'bg-slate-400'
        let borderClass = 'border-slate-200'
        let ringClass = 'ring-slate-500 border-slate-500'
        let bgCheckClass = 'bg-muted0'
        let avatarBorderClass = 'border border-slate-200'
        let avatarBgClass = 'bg-muted text-muted-foreground'
        let badgeClass = 'bg-muted text-muted-foreground'

        if (isAIAgent) {
            accentColor = 'bg-indigo-500'
            borderClass = 'border-indigo-200'
            ringClass = 'ring-slate-500 border-slate-500'
            bgCheckClass = 'bg-muted0'
            avatarBorderClass = 'border-2 border-indigo-300'
            avatarBgClass = 'bg-indigo-100 text-indigo-700 font-bold'
            badgeClass = 'text-indigo-600 border-indigo-200 bg-indigo-50'
        } else if (isFounder) {
            accentColor = 'bg-purple-500'
            borderClass = 'border-purple-200'
            ringClass = 'ring-slate-500 border-slate-500'
            bgCheckClass = 'bg-muted0'
            avatarBorderClass = 'border-2 border-purple-500'
            avatarBgClass = 'bg-purple-100 text-purple-700 font-bold'
            badgeClass = 'text-purple-600 border-purple-200 bg-purple-50'
        } else if (isExecutive) {
            accentColor = 'bg-amber-500'
            borderClass = 'border-amber-200'
            ringClass = 'ring-slate-500 border-slate-500'
            bgCheckClass = 'bg-muted0'
            avatarBorderClass = 'border-2 border-amber-500'
            avatarBgClass = 'bg-amber-100 text-amber-700 font-bold'
            badgeClass = 'text-amber-600 border-amber-200 bg-amber-50'
        } else {
            // Apprentice
            accentColor = 'bg-blue-500'
            borderClass = 'border'
            avatarBorderClass = 'border-2 border-blue-400'
            avatarBgClass = 'bg-blue-100 text-blue-700 font-bold'
            badgeClass = 'text-blue-600 border bg-blue-50'
        }

        // Centaur Override
        if (isCentaur) {
            borderClass = 'border-amber-400 shadow-md ring-1 ring-amber-400/50'
        }

        const cardContent = (
            <Card className={`
                bg-background border shadow-sm transition-all cursor-pointer relative group/card
                ${borderClass}
                hover:border-slate-400 hover:shadow-md hover:-translate-y-[2px] active:translate-y-0 active:shadow-sm
                ${compareMode && isSelected ? `ring-2 ${ringClass}` : ''}
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${isDropTarget ? 'ring-2 ring-green-500 border-green-500 bg-green-50' : ''}
                ${isPairing || isDeleting ? 'opacity-60' : ''}
            `}>
                {compareMode && (
                    <div className={`absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-white text-xs z-10
                        ${isSelected ? bgCheckClass : 'bg-slate-200'}
                    `}>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                    </div>
                )}

                {isDropTarget && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg z-10 backdrop-blur-[1px]">
                        <div className="bg-green-600 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                            <Zap className="h-3 w-3 fill-white" />
                            {draggedMemberId && aiAgents.some(a => a.id === draggedMemberId) ? 'Pair Centaur' : 'Combine / Team'}
                        </div>
                    </div>
                )}
                {(isPairing || isDeleting) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted0/10 rounded-lg z-10 backdrop-blur-[1px]">
                        <div className="bg-slate-700 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {isPairing ? 'Pairing...' : 'Removing...'}
                        </div>
                    </div>
                )}

                {/* Collapsed View - Always Visible */}
                <CardHeader className="p-4 pb-2">
                    <div className="flex items-center gap-3">
                        {/* Role Accent Bar */}
                        <div className={`w-1 h-12 ${accentColor} rounded-full self-stretch`} />
                        
                        {/* Avatar with Presence */}
                        <div className="relative">
                            <Avatar className={`h-10 w-10 ${avatarBorderClass}`}>
                                <AvatarFallback className={avatarBgClass}>
                                    {isAIAgent ? <Brain className="h-5 w-5" /> : getInitials(member.full_name)}
                                </AvatarFallback>
                            </Avatar>
                            {!isAIAgent && (
                                <PresenceIndicator
                                    status={getPresenceForUser(member.id)?.status || 'offline'}
                                    presence={getPresenceForUser(member.id)}
                                    size="sm"
                                />
                            )}
                            {isCentaur && (
                                <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-[1px] shadow-sm border border-slate-200">
                                    <Avatar className="h-4 w-4 border border-indigo-200">
                                        <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[6px]">
                                            <Brain className="h-2 w-2" />
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            )}
                        </div>

                        {/* Name & Role */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground truncate text-sm">
                                    {member.full_name}
                                </h3>
                                {isCentaur && (
                                    <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700 h-4 px-1 border-amber-200">
                                        Centaur
                                    </Badge>
                                )}
                            </div>
                            <Badge variant="secondary" className={`text-[9px] mt-0.5 ${badgeClass}`}>
                                {member.role}
                            </Badge>
                        </div>

                        {/* Expand/Collapse & Menu */}
                        <div className="flex items-center gap-1">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        type="button"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                        }}
                                        aria-label={`Actions for ${member.full_name}`}
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" sideOffset={8}>
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            window.location.href = `/team/${member.id}`
                                        }}
                                    >
                                        <User className="mr-2 h-4 w-4" /> View Profile
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setMemberToDelete(member.id)
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Email (truncated in collapsed) */}
                    {member.email && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 ml-4">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">{member.email}</span>
                        </div>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center justify-between mt-3 ml-4">
                        <div className="flex gap-3 text-xs">
                            <span className="text-green-600 font-medium">{member.completedTasks} done</span>
                            <span className="text-blue-600 font-medium">{member.activeTasks} active</span>
                            <span className="text-muted-foreground">{member.pendingTasks} pending</span>
                        </div>
                        <button
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (!compareMode) toggleMemberExpand(member.id)
                            }}
                            className="text-muted-foreground hover:text-muted-foreground transition-colors p-1"
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                    </div>
                </CardHeader>

                {/* Expanded View */}
                {isExpanded && (
                    <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t border-slate-100 mt-2">
                        {/* Full Contact Info */}
                        <div className="space-y-1 pt-3">
                            {member.phone_number && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3 text-muted-foreground" />
                                    <span>{member.phone_number}</span>
                                </div>
                            )}
                        </div>

                        {/* Bio */}
                        {member.bio && (
                            <p className="text-xs text-muted-foreground italic bg-muted p-2 rounded">
                                {member.bio}
                            </p>
                        )}

                        {/* Centaur Pairing Info */}
                        {isCentaur && pairedAI && (
                            <div className="flex items-center gap-2 text-xs bg-amber-50 p-2 rounded border border-amber-200">
                                <Brain className="h-4 w-4 text-amber-600" />
                                <span className="text-amber-700">Paired with <strong>{pairedAI.full_name}</strong></span>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        startTransition(async () => {
                                            await unpairCentaur(member.id)
                                            toast.success("Centaur unpaired")
                                        })
                                    }}
                                    className="ml-auto text-amber-600 hover:text-red-600 transition-colors"
                                >
                                    <Unplug className="h-3 w-3" />
                                </button>
                            </div>
                        )}

                        {/* Current Tasks */}
                        {activeTaskDetails.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Current Tasks</h4>
                                <div className="space-y-2">
                                    {activeTaskDetails.slice(0, 3).map((task, idx) => {
                                        const isOverdue = task.end_date ? isPast(parseISO(task.end_date)) : false
                                        const hasDeadline = !!task.end_date
                                        
                                        return (
                                            <div key={idx} className={cn(
                                                "flex flex-col gap-1 text-xs p-2 rounded border",
                                                isOverdue ? "bg-red-50 border-red-200" : "bg-muted border-slate-200"
                                            )}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="truncate text-foreground font-medium flex-1">{task.title}</span>
                                                    {hasDeadline && (
                                                        <div className={cn(
                                                            "flex items-center gap-1 shrink-0",
                                                            isOverdue ? "text-red-600" : "text-muted-foreground"
                                                        )}>
                                                            {isOverdue ? (
                                                                <AlertTriangle className="h-3 w-3" />
                                                            ) : (
                                                                <Clock className="h-3 w-3" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {hasDeadline && (
                                                    <div className={cn(
                                                        "flex items-center gap-1 text-[10px]",
                                                        isOverdue ? "text-red-600" : "text-muted-foreground"
                                                    )}>
                                                        <Calendar className="h-3 w-3" />
                                                        <span>
                                                            {isOverdue ? 'Overdue ' : 'Due '}
                                                            {formatDistanceToNow(parseISO(task.end_date), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {activeTaskDetails.length > 3 && (
                                        <div className="text-xs text-muted-foreground text-center pt-1">
                                            +{activeTaskDetails.length - 3} more tasks
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                className="flex-1 text-xs h-8"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    window.location.href = `/team/${member.id}`
                                }}
                            >
                                <User className="h-3 w-3 mr-1" />
                                Profile
                            </Button>
                            {member.role !== 'AI_Agent' && aiAgents.length > 0 && !isCentaur && (
                                <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        const availableAI = aiAgents.find(ai => ai.id !== member.paired_ai_id)
                                        if (availableAI) {
                                            setPairingMemberId(member.id)
                                            startTransition(async () => {
                                                const res = await pairCentaur(member.id, availableAI.id)
                                                if (res?.error) {
                                                    toast.error(res.error)
                                                } else {
                                                    toast.success(`Paired ${member.full_name} with ${availableAI.full_name}`)
                                                }
                                                setPairingMemberId(null)
                                            })
                                        }
                                    }}
                                    disabled={isPairing}
                                    className="flex-1 text-xs h-8"
                                >
                                    <Zap className="h-3 w-3 mr-1" />
                                    Pair AI
                                </Button>
                            )}
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setQuickTeamMemberIds([member.id])
                                    setTeamName("")
                                    setTeamError(null)
                                    setShowQuickTeamDialog(true)
                                }}
                                className="flex-1 text-xs h-8"
                            >
                                <Users className="h-3 w-3 mr-1" />
                                Team
                            </Button>
                        </div>
                    </CardContent>
                )}
            </Card>
        )

        // In compare mode, don't allow drag-drop
        if (compareMode) {
            return (
                <div className="block group" onClick={() => toggleSelection(member.id)}>
                    {cardContent}
                </div>
            )
        }

        // Normal mode: draggable cards with link functionality
        return (
            <div
                draggable={true}
                onDragStart={(e) => handleDragStart(e, member.id)}
                onDragOver={(e) => handleDragOver(e, member.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, member.id)}
                onDragEnd={handleDragEnd}
                className="block group cursor-grab active:cursor-grabbing active:scale-[0.98] transition-transform"
                aria-grabbed={draggedMemberId === member.id}
                role="button"
                tabIndex={0}
                aria-label={`Drag ${member.full_name} to pair or create team`}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        // For keyboard users, we could show a menu to select action
                        // For now, just prevent default behavior
                    }
                }}
            >
                <Link
                    href={`/team/${member.id}`}
                    draggable={false}
                    onClick={(e) => { if (draggedMemberId) e.preventDefault() }}
                >
                    {cardContent}
                </Link>
            </div>
        )
    }

    const MemberListItem = ({ member, type }: { member: Member, type: 'founder' | 'executive' | 'apprentice' | 'ai_agent' }) => {
        const isFounder = type === 'founder'
        const isExecutive = type === 'executive'
        const isAIAgent = type === 'ai_agent'

        // Centaur Status
        const pairedAI = member.pairedAI?.[0]
        const isCentaur = !!member.paired_ai_id && !!pairedAI

        let badgeClass = 'text-muted-foreground border bg-muted'

        if (isAIAgent) {
            badgeClass = 'text-indigo-600 border-indigo-200 bg-indigo-50'
        } else if (isFounder) {
            badgeClass = 'text-purple-600 border-purple-200 bg-purple-50'
        } else if (isExecutive) {
            badgeClass = 'text-amber-600 border-amber-200 bg-amber-50'
        }

        return (
            <tr className="group hover:bg-muted active:bg-muted transition-colors border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-3">
                        <Link href={`/team/${member.id}`} className="flex items-center gap-3">
                            <div className="relative">
                                <Avatar className="h-9 w-9 border border-slate-200">
                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                        {isAIAgent ? <Brain className="h-4 w-4" /> : getInitials(member.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                {!isAIAgent && (
                                    <PresenceIndicator
                                        status={getPresenceForUser(member.id)?.status || 'offline'}
                                        presence={getPresenceForUser(member.id)}
                                        size="sm"
                                    />
                                )}
                            </div>
                            <span className="font-medium text-foreground group-hover:text-blue-600 group-active:text-blue-700 transition-colors">
                                {member.full_name}
                            </span>
                        </Link>
                    </div>
                </td>
                <td className="px-4 py-3">
                    <Badge variant="secondary" className={`text-[10px] ${badgeClass} font-normal`}>
                        {member.role}
                    </Badge>
                </td>
                <td className="px-4 py-3">
                    {isCentaur && (
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 h-5 px-1.5 border-amber-200 gap-1 pl-1">
                                <Avatar className="h-3 w-3 inline-block">
                                    <AvatarFallback className="bg-amber-200 text-amber-800 text-[6px]">AI</AvatarFallback>
                                </Avatar>
                                {pairedAI.full_name}
                            </Badge>
                            <button
                                aria-label="Unpair Centaur"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    startTransition(async () => {
                                        await unpairCentaur(member.id)
                                        toast.success("Centaur unpaired")
                                    })
                                }}
                                className="text-slate-300 hover:text-red-500 hover:bg-red-50 active:text-red-600 active:bg-red-100 rounded p-1 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Unplug className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-col gap-1 text-xs">
                        <div className="flex gap-3">
                            <span className="text-green-600 font-medium">{member.completedTasks} done</span>
                            <span className="text-blue-600 font-medium">{member.activeTasks} active</span>
                            <span className="text-muted-foreground">{member.pendingTasks} pending</span>
                        </div>
                        {member.taskTitles?.active && member.taskTitles.active.length > 0 && (
                            <div className="text-blue-600 truncate max-w-[200px]">
                                <span className="font-semibold">Active:</span> {member.taskTitles.active[0]}
                                {member.taskTitles.active.length > 1 && ` +${member.taskTitles.active.length - 1} more`}
                            </div>
                        )}
                        {member.taskTitles?.pending && member.taskTitles.pending.length > 0 && (
                            <div className="text-muted-foreground truncate max-w-[200px]">
                                <span className="font-semibold">Pending:</span> {member.taskTitles.pending[0]}
                                {member.taskTitles.pending.length > 1 && ` +${member.taskTitles.pending.length - 1} more`}
                            </div>
                        )}
                    </div>
                </td>
                <td className="px-4 py-3 text-right pr-6">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                type="button"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label={`Actions for ${member.full_name}`}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href={`/team/${member.id}`}>View Profile</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                onClick={() => setMemberToDelete(member.id)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Person
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </td>
            </tr>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Team</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Manage your team members and roles</p>
                </div>
                <div className="flex items-center gap-2">
                    <RefreshButton />
                    <FeatureTip
                        id="team-invite"
                        title="Build Your Team"
                        description="Invite team members by email. Assign roles and they'll join your foundry automatically."
                        align="right"
                    >
                        <InviteMemberDialog />
                    </FeatureTip>
                    <CreateTeamDialog members={[...executives, ...apprentices]} />

                    {compareMode && selectedIds.size >= 2 && (
                        <Button
                            onClick={() => setShowComparison(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <GitCompare className="h-4 w-4 mr-2" />
                            Compare {selectedIds.size}
                        </Button>
                    )}
                    <Button
                        variant={compareMode ? "default" : "secondary"}
                        onClick={toggleCompareMode}
                        className={compareMode ? "bg-slate-800" : ""}
                    >
                        {compareMode ? <X className="h-4 w-4 mr-2" /> : <GitCompare className="h-4 w-4 mr-2" />}
                        {compareMode ? "Cancel" : "Compare"}
                    </Button>
                    <div className="flex bg-muted p-1 rounded-lg border border ml-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('grid')}
                            className={`h-8 w-8 p-0 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMode('list')}
                            className={`h-8 w-8 p-0 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {compareMode && (
                <div className="bg-blue-50 border border rounded-lg p-3 text-sm text-blue-700">
                    Select 2-4 team members to compare. Click a card to select.
                    {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
                </div>
            )}

            {/* Pending Invitations */}
            <PendingInvitations />

            {/* Founders Section */}
            {founders.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-purple-600 uppercase tracking-wider border-b border pb-2">
                        Founders (Decide)
                    </h2>
                    {viewMode === 'grid' ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {founders.map(member => (
                                <MemberCard key={member.id} member={member} type="founder" />
                            ))}
                        </div>
                    ) : (
                        <div className="border border rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted text-muted-foreground font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 pl-6">Profile</th>
                                        <th className="px-4 py-3">Role</th>
                                        <th className="px-4 py-3">Paired Centaur</th>
                                        <th className="px-4 py-3">Tasks</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {founders.map(member => (
                                        <MemberListItem key={member.id} member={member} type="founder" />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {/* Executives Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-amber-600 uppercase tracking-wider border-b border pb-2">
                    Executives (Evaluate)
                </h2>
                {viewMode === 'grid' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {executives.map(member => (
                            <MemberCard key={member.id} member={member} type="executive" />
                        ))}
                        {executives.length === 0 && (
                            <div className="col-span-full border-2 border-dashed border rounded-lg">
                                <EmptyState
                                    icon={<Users className="h-8 w-8" />}
                                    title="No executives yet"
                                    description="Add executives to evaluate and approve work."
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="border border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 pl-6">Profile</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Paired Centaur</th>
                                    <th className="px-4 py-3">Tasks</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {executives.map(member => (
                                    <MemberListItem key={member.id} member={member} type="executive" />
                                ))}
                                {executives.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8">
                                            <EmptyState
                                                icon={<Users className="h-12 w-12" />}
                                                title="No executives yet"
                                                description="Add executives to evaluate and approve work."
                                            />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Apprentices Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-blue-600 uppercase tracking-wider border-b border pb-2">
                    Apprentices (Do)
                </h2>
                {viewMode === 'grid' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {apprentices.map(member => (
                            <MemberCard key={member.id} member={member} type="apprentice" />
                        ))}
                        {apprentices.length === 0 && (
                            <div className="col-span-full border-2 border-dashed border rounded-lg">
                                <EmptyState
                                    icon={<Users className="h-8 w-8" />}
                                    title="No apprentices yet"
                                    description="Add apprentices to execute tasks and complete work."
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="border border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-muted-foreground font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 pl-6">Profile</th>
                                    <th className="px-4 py-3">Role</th>
                                    <th className="px-4 py-3">Paired Centaur</th>
                                    <th className="px-4 py-3">Tasks</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {apprentices.map(member => (
                                    <MemberListItem key={member.id} member={member} type="apprentice" />
                                ))}
                                {apprentices.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8">
                                            <EmptyState
                                                icon={<Users className="h-8 w-8" />}
                                                title="No apprentices yet"
                                                description="Add apprentices to execute tasks and complete work."
                                            />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Neural Network (AI Agents) */}
            {aiAgents.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-indigo-600 uppercase tracking-wider border-b border-indigo-200 pb-2 flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Neural Network (AI Agents)
                    </h2>
                    <p className="text-sm text-muted-foreground italic pb-2">
                        Drag an AI Agent onto a human member to form a Centaur pair.
                    </p>
                    {aiAgents.length === 0 ? (
                        <div className="border-2 border-dashed border rounded-lg">
                            <EmptyState
                                icon={<Brain className="h-12 w-12" />}
                                title="No AI agents yet"
                                description="Add AI agents to automate tasks and enhance productivity."
                            />
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {aiAgents.map(member => (
                                <MemberCard key={member.id} member={member} type="ai_agent" />
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Teams Section */}
            {teams.length > 0 && (
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-green-600 uppercase tracking-wider border-b border pb-2">
                        Teams
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {teams.map(team => {
                            const isDropTarget = dropTargetId === team.id

                            return (
                                <Card
                                    key={team.id}
                                    className={`
                                        bg-background border shadow-sm transition-all group relative
                                        ${isDropTarget ? 'ring-2 ring-green-500 border-green-500 bg-green-50' : 'hover:border-green-400 active:border-green-500'}
                                    `}
                                    onDragOver={(e) => {
                                        e.preventDefault()
                                        e.dataTransfer.dropEffect = 'move'
                                        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
                                        if (draggedId && !team.members.some(m => m.id === draggedId)) {
                                            setDropTargetId(team.id)
                                        }
                                    }}
                                    onDragLeave={() => setDropTargetId(null)}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId

                                        if (draggedId && !team.members.some(m => m.id === draggedId)) {
                                            startTransition(async () => {
                                                await addTeamMember(team.id, draggedId)
                                            })
                                        }
                                        setDropTargetId(null)
                                        setDraggedMemberId(null)
                                    }}
                                >
                                    {isDropTarget && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-lg z-10">
                                            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                Add to Team
                                            </div>
                                        </div>
                                    )}
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-lg text-foreground truncate pr-6">{team.name}</CardTitle>

                                            <div className="flex items-center gap-2">
                                                {team.is_auto_generated && (
                                                    <Badge variant="secondary" className="text-[10px] text-muted-foreground">Auto</Badge>
                                                )}

                                                {/* Team Actions Dropdown */}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-muted-foreground">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-[160px] bg-background border-slate-200" sideOffset={8}>
                                                        <DropdownMenuItem onClick={() => {
                                                            setTeamToEdit({ id: team.id, name: team.name })
                                                            setNewName(team.name)
                                                        }}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Rename
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => setTeamToDelete(team.id)}
                                                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2">
                                            {/* Member avatars */}
                                            <div className="flex -space-x-2">
                                                {(team.members || []).slice(0, 4).map(member => (
                                                    <Avatar key={member.id} className="h-8 w-8 border-2 border-white">
                                                        <AvatarFallback className="bg-green-100 text-green-700 text-xs font-bold">
                                                            {getInitials(member.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ))}
                                                {(team.members || []).length > 4 && (
                                                    <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs text-muted-foreground">
                                                        +{(team.members || []).length - 4}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-sm text-muted-foreground ml-2">{(team.members || []).length} members</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Comparison Dialog */}
            <Dialog open={showComparison} onOpenChange={setShowComparison}>
                <DialogContent size="lg" className="bg-background">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Compare Team Members</DialogTitle>
                        <DialogDescription>Side-by-side comparison of selected members</DialogDescription>
                    </DialogHeader>

                    <Table>
                        <TableHeader>
                            <TableRow className="border-b">
                                <TableHead className="w-32"></TableHead>
                                {selectedMembers.map(member => (
                                    <TableHead key={member.id} className="text-center min-w-[160px]">
                                        <div className="flex flex-col items-center gap-2">
                                            <Avatar className="h-16 w-16 border-2 border-slate-200">
                                                <AvatarFallback className="bg-muted text-muted-foreground text-lg font-bold">
                                                    {member.full_name?.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="font-semibold text-foreground">{member.full_name}</span>
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {comparisonRows.map((row, idx) => (
                                <TableRow key={row.label} className={idx % 2 === 0 ? 'bg-muted' : 'bg-white'}>
                                    <TableCell className="text-muted-foreground font-medium text-sm">{row.label}</TableCell>
                                    {selectedMembers.map(member => {
                                        const value = row.getValue(member)
                                        const isNumeric = typeof value === 'number'

                                        // Find best value for highlighting
                                        const allValues = selectedMembers.map(m => row.getValue(m))
                                        const numericValues = allValues.filter(v => typeof v === 'number') as number[]
                                        const maxVal = Math.max(...numericValues)
                                        const isBest = isNumeric && row.good && value === maxVal
                                        const isWorst = isNumeric && row.caution && value === maxVal && value > 0

                                        return (
                                            <TableCell
                                                key={member.id}
                                                className={cn(
                                                    "text-center font-medium",
                                                    isBest && "text-green-600 bg-green-50",
                                                    isWorst && "text-red-600 bg-red-50",
                                                    !isBest && !isWorst && "text-foreground"
                                                )}
                                            >
                                                {value}
                                            </TableCell>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
            </Dialog>

            {/* Quick Team Creation Dialog (from drag-drop or button) */}
            <Dialog open={showQuickTeamDialog} onOpenChange={setShowQuickTeamDialog}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Users className="h-5 w-5 text-green-600" />
                            Create Team
                        </DialogTitle>
                        <DialogDescription>
                            {quickTeamMemberIds.length === 1 
                                ? "Select additional members and name your team"
                                : "Name your new team with these members"
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2">
                        {/* Show selected members */}
                        <div className="flex items-center justify-center gap-4 py-4 flex-wrap">
                            {quickTeamMembers.map((member, idx) => (
                                <div key={member.id} className="flex flex-col items-center relative">
                                    <Avatar className="h-14 w-14 border-2 border-green-500">
                                        <AvatarFallback className="bg-green-100 text-green-700 font-bold">
                                            {getInitials(member.full_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium text-foreground mt-2">{member.full_name?.split(' ')[0]}</span>
                                    {idx < quickTeamMembers.length - 1 && (
                                        <span className="absolute top-7 left-[calc(100%+0.5rem)] text-2xl text-green-600">+</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Allow selecting additional members if starting with one */}
                        {quickTeamMemberIds.length === 1 && (
                            <div className="space-y-2">
                                <Label>Add Members</Label>
                                <div className="max-h-40 overflow-y-auto border border rounded-md p-2 space-y-1">
                                    {allMembers
                                        .filter(m => !quickTeamMemberIds.includes(m.id))
                                        .map(member => (
                                            <button
                                                key={member.id}
                                                type="button"
                                                onClick={() => {
                                                    if (quickTeamMemberIds.includes(member.id)) {
                                                        setQuickTeamMemberIds(prev => prev.filter(id => id !== member.id))
                                                    } else {
                                                        setQuickTeamMemberIds(prev => [...prev, member.id])
                                                    }
                                                }}
                                                className={cn(
                                                    "w-full text-left px-2 py-1.5 rounded text-sm transition-colors",
                                                    quickTeamMemberIds.includes(member.id)
                                                        ? "bg-green-50 text-green-700 border border-green-200"
                                                        : "hover:bg-muted"
                                                )}
                                            >
                                                {member.full_name}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="quickTeamName">Team Name</Label>
                            <Input
                                id="quickTeamName"
                                placeholder="e.g., Project Alpha, Design Squad..."
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateQuickTeam() }}
                                autoFocus
                            />
                        </div>

                        {teamError && (
                            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                                {teamError}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="secondary" onClick={() => {
                                setShowQuickTeamDialog(false)
                                setQuickTeamMemberIds([])
                                setTeamName("")
                            }}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateQuickTeam}
                                disabled={isPending || !teamName.trim() || quickTeamMemberIds.length < 2}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isPending ? "Creating..." : "Create Team"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            {/* Rename Team Dialog */}
            <Dialog open={!!teamToEdit} onOpenChange={(open) => !open && setTeamToEdit(null)}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>Rename Team</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-team-name">Team Name</Label>
                            <Input
                                id="edit-team-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Team Name"
                                autoFocus
                                className="bg-background border-slate-300"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setTeamToEdit(null)}>Cancel</Button>
                        <Button onClick={handleUpdateName} disabled={isPending || !newName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
                <AlertDialogContent className="bg-background text-foreground border-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Team?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this team. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTeam} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                            Delete Team
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Member Delete/Archive Confirmation */}
            <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
                <AlertDialogContent className="bg-background text-foreground border-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Remove Person?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove the person from the roster.
                            <br /><br />
                            <strong>Ownership Transfer:</strong> Any Tasks or Objectives created by this person will be reassigned to you.
                            <br />
                            <strong>Unassignment:</strong> Any Tasks assigned to them will become unassigned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={!!deletingMemberId}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteMember} disabled={!!deletingMemberId} className="bg-red-600 hover:bg-red-700 focus:ring-red-600">
                            {deletingMemberId ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Removing...
                                </>
                            ) : (
                                "Remove Person"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    )
}


