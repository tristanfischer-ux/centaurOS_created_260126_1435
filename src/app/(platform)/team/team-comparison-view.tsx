"use client"

import { useState, useTransition, useCallback } from "react"
import { useAutoRefresh } from "@/hooks/useAutoRefresh"
import { RefreshButton } from "@/components/RefreshButton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
    Check, Users, MoreHorizontal, Pencil, Trash2, Loader2, AlertTriangle,
    LayoutGrid, List, User, MessageSquare, Brain, Unplug, Zap, Search,
    ArrowRight, UserPlus, Plus, Activity, ShieldCheck, ChevronRight,
    BarChart3
} from "lucide-react"
import { ViewToggle } from "@/components/ui/view-toggle"
import { createTeam, addTeamMember, deleteMember } from "@/actions/team"
import { startDirectMessage } from "@/actions/messaging"
import { deleteTeam, updateTeamName } from "@/actions/teams"
import Link from "next/link"
import { InviteMemberDialog } from "./invite-member-dialog"
import { PendingInvitations } from "./pending-invitations"
import { FeatureTip } from "@/components/onboarding"
import { pairAIAgent, unpairAIAgent } from "@/actions/team"
import { toast } from "sonner"
import { FullProfileView } from "@/components/team/full-profile-view"
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
import { TeamComparisonBar } from "@/components/team/team-comparison-bar"
import { TeamComparisonModal } from "@/components/team/team-comparison-modal"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { TeamMemberCard, CardSize } from "@/components/team/team-member-card"
import { FullTaskView } from "@/components/tasks/full-task-view"

const TeamAnalytics = dynamic(
  () => import("@/components/team/team-analytics").then((m) => ({ default: m.TeamAnalytics })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px] rounded-lg" /> },
)
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// New feature imports
import { SmartInsights } from "./smart-insights"
import { WorkloadBoard } from "./workload-board"
import { QuickAssignDialog } from "./quick-assign-dialog"
import { TeamDetailCard } from "./team-detail-card"


// ─── Types ───────────────────────────────────────

interface TaskDetail {
    id: string
    title: string
    end_date: string | null
    start_date: string | null
    created_at: string
    objective_id: string | null
    objective_title: string | null
    progress: number | null
    risk_level: string | null
    status: string
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

interface ExtendedTask {
    id: string
    title: string
    status: string
    assignee_id: string | null
    end_date: string | null
    start_date: string | null
    created_at: string
    objective_id: string | null
    objective_title: string | null
    progress: number | null
    risk_level: string | null
}

interface InsightMember {
    id: string
    name: string
}

interface Insights {
    overloadedMembers: InsightMember[]
    idleMembers: InsightMember[]
    overdueTaskCount: number
    unassignedTaskCount: number
    totalActiveTasks: number
    totalPendingTasks: number
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
    teams: Team[]
    currentUserId: string
    insights?: Insights
    unassignedTasks?: ExtendedTask[]
    allTasks?: ExtendedTask[]
}


// ─── Main Component ──────────────────────────────

export function TeamComparisonView({ founders, executives, apprentices, teams, currentUserId, insights, unassignedTasks, allTasks }: TeamComparisonViewProps) {
    // View state
    const [activeTab, setActiveTab] = useState<'members' | 'teams' | 'workload'>('members')
    const [showQuickAssign, setShowQuickAssign] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [searchQuery, setSearchQuery] = useState("")

    // Selection & comparison
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showComparison, setShowComparison] = useState(false)

    // Profile & task modals
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [fullTaskData, setFullTaskData] = useState<any>(null)
    const [isLoadingTask, setIsLoadingTask] = useState(false)

    // Drag-and-drop state
    const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)
    const [pairingMemberId, setPairingMemberId] = useState<string | null>(null)
    const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)

    // Quick team creation from drag-drop
    const [showQuickTeamDialog, setShowQuickTeamDialog] = useState(false)
    const [quickTeamMemberIds, setQuickTeamMemberIds] = useState<string[]>([])
    const [teamName, setTeamName] = useState("")
    const [teamError, setTeamError] = useState<string | null>(null)

    // Team management
    const [teamToEdit, setTeamToEdit] = useState<{ id: string, name: string } | null>(null)
    const [teamToDelete, setTeamToDelete] = useState<string | null>(null)
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [newName, setNewName] = useState("")

    // Transitions
    const [isPending, startTransition] = useTransition()

    // Card sizes for marketplace cards
    const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>({})

    // Presence
    const { getPresenceForUser } = usePresenceContext()
    useAutoRefresh({ tables: ['profiles', 'teams', 'presence'] })

    // Derived data
    const allMembers = [...founders, ...executives, ...apprentices]
    const selectedMembers = allMembers.filter(m => selectedIds.has(m.id))
    const quickTeamMembers = allMembers.filter(m => quickTeamMemberIds.includes(m.id))
    const humanMembers = allMembers.filter(m => m.role !== 'AI_Agent')

    // ─── Stats ─────────────────────────────────

    const totalPeople = allMembers.length
    const totalTeams = teams.filter(t => !t.is_auto_generated).length
    const pairedCount = humanMembers.filter(m => m.paired_ai_id).length
    const avgCapacity = humanMembers.length > 0
        ? Math.round(humanMembers.reduce((sum, m) => {
            const score = Math.min(100, (m.activeTasks * 20) + (m.pendingTasks * 10))
            return sum + (100 - score)
        }, 0) / humanMembers.length)
        : 100

    // ─── Search Filter ─────────────────────────

    const filterMembers = (members: Member[]) => {
        if (!searchQuery.trim()) return members
        const q = searchQuery.toLowerCase()
        return members.filter(m =>
            m.full_name?.toLowerCase().includes(q) ||
            m.role?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q)
        )
    }

    const filterTeams = (teamsList: Team[]) => {
        if (!searchQuery.trim()) return teamsList
        const q = searchQuery.toLowerCase()
        return teamsList.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.members.some(m => m.full_name?.toLowerCase().includes(q))
        )
    }

    const filteredFounders = filterMembers(founders)
    const filteredExecutives = filterMembers(executives)
    const filteredApprentices = filterMembers(apprentices)
    const filteredTeams = filterTeams(teams)

    // ─── Handlers ──────────────────────────────

    const handleCardSizeChange = useCallback((memberId: string, size: CardSize) => {
        setCardSizes(prev => ({ ...prev, [memberId]: size }))
    }, [])

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else if (newSet.size < 4) {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleMessage = async (memberId: string) => {
        const member = allMembers.find(m => m.id === memberId)
        const result = await startDirectMessage(memberId)
        if (result.success) {
            toast.success(`Started conversation with ${member?.full_name || 'member'}`)
        } else {
            toast.error(result.error || 'Failed to start conversation')
        }
    }

    const handleAddToTeam = (memberId: string) => {
        setQuickTeamMemberIds([memberId])
        setTeamName("")
        setTeamError(null)
        setShowQuickTeamDialog(true)
    }

    const handleTaskClick = useCallback(async (taskId: string) => {
        setSelectedTaskId(taskId)
        setIsLoadingTask(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single()
            if (error) {
                toast.error('Failed to load task')
                setSelectedTaskId(null)
                return
            }
            setFullTaskData(data)
        } catch {
            toast.error('Failed to load task')
            setSelectedTaskId(null)
        } finally {
            setIsLoadingTask(false)
        }
    }, [])

    // Drag-and-drop handlers
    const handleDragStart = (e: React.DragEvent, memberId: string) => {
        setDraggedMemberId(memberId)
        e.dataTransfer.setData('text/plain', memberId)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, memberId: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== memberId) {
            setDropTargetId(memberId)
        }
    }

    const handleDragLeave = () => setDropTargetId(null)

    const handleDrop = (e: React.DragEvent, targetMemberId: string) => {
        e.preventDefault()
        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId
        const draggedMember = allMembers.find(m => m.id === draggedId)
        const targetMember = allMembers.find(m => m.id === targetMemberId)

        if (draggedMember && targetMember) {
            // AI pairing logic
            if (draggedMember.role === 'AI_Agent' && targetMember.role !== 'AI_Agent') {
                setPairingMemberId(targetMember.id)
                startTransition(async () => {
                    const res = await pairAIAgent(targetMember.id, draggedMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${targetMember.full_name} with ${draggedMember.full_name}`)
                    setPairingMemberId(null)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
            if (draggedMember.role !== 'AI_Agent' && targetMember.role === 'AI_Agent') {
                setPairingMemberId(draggedMember.id)
                startTransition(async () => {
                    const res = await pairAIAgent(draggedMember.id, targetMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${draggedMember.full_name} with ${targetMember.full_name}`)
                    setPairingMemberId(null)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
        }

        // Team creation from drag-drop
        if (draggedId && draggedId !== targetMemberId) {
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

    // Team management handlers
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
            if (result?.error) toast.error(result.error)
            else setTeamToDelete(null)
        })
    }

    const handleDeleteMember = async () => {
        if (!memberToDelete) return
        setDeletingMemberId(memberToDelete)
        startTransition(async () => {
            const res = await deleteMember(memberToDelete)
            if (res?.error) toast.error(res.error)
            else {
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
            if (result.error) setTeamError(result.error)
            else {
                setShowQuickTeamDialog(false)
                setQuickTeamMemberIds([])
                setTeamName("")
            }
        })
    }

    // ─── Helper: Bandwidth ─────────────────────

    const getBandwidth = (member: Member): { label: string; className: string; score: number } => {
        const score = Math.min(100, (member.activeTasks * 20) + (member.pendingTasks * 10))
        if (score <= 40) return { label: 'Has capacity', className: 'bg-status-success-light text-status-success-dark', score }
        if (score <= 70) return { label: 'At capacity', className: 'bg-status-warning-light text-status-warning-dark', score }
        return { label: 'Overloaded', className: 'bg-status-error-light text-status-error-dark', score }
    }


    // ─── Member List Row ───────────────────────

    const MemberListItem = ({ member }: { member: Member }) => {
        const isAIAgent = member.role === 'AI_Agent'
        const pairedAI = member.pairedAI?.[0]
        const isPaired = !!member.paired_ai_id && !!pairedAI

        const roleBadgeClass = isAIAgent
            ? 'text-chart-5 border-chart-5/30 bg-chart-5/10'
            : member.role === 'Founder'
                ? 'text-international-orange border-international-orange/30 bg-international-orange/10'
                : member.role === 'Executive'
                    ? 'text-international-orange/80 border-international-orange/20 bg-international-orange/5'
                    : 'text-muted-foreground border bg-muted'

        return (
            <tr className="group hover:bg-muted/50 active:bg-muted transition-colors duration-150 border-b border-muted last:border-0">
                <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-3">
                        <button
                            className="flex items-center gap-3"
                            onClick={() => setSelectedMemberId(member.id)}
                        >
                            <div className="relative">
                                {isAIAgent ? (
                                    <Avatar className="h-9 w-9 border border-chart-5/30">
                                        <AvatarFallback className="bg-chart-5/10 text-chart-5 text-xs">
                                            <Brain className="h-4 w-4" />
                                        </AvatarFallback>
                                    </Avatar>
                                ) : (
                                    <UserAvatar
                                        name={member.full_name}
                                        role={member.role}
                                        size="sm"
                                        className="border border-muted"
                                    />
                                )}
                                {!isAIAgent && (
                                    <PresenceIndicator
                                        status={getPresenceForUser(member.id)?.status || 'offline'}
                                        presence={getPresenceForUser(member.id)}
                                        size="sm"
                                    />
                                )}
                            </div>
                            <span className="font-medium text-foreground group-hover:text-electric-blue transition-colors">
                                {member.full_name}
                            </span>
                        </button>
                    </div>
                </td>
                <td className="px-4 py-3">
                    <Badge variant="secondary" className={cn("text-[10px] font-normal", roleBadgeClass)}>
                        {member.role}
                    </Badge>
                </td>
                <td className="px-4 py-3">
                    {isPaired && (
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] bg-status-warning-light text-status-warning-dark h-5 px-1.5 border-status-warning-light gap-1 pl-1">
                                <Avatar className="h-3 w-3 inline-block">
                                    <AvatarFallback className="bg-status-warning-light text-status-warning-dark text-[6px]">AI</AvatarFallback>
                                </Avatar>
                                {pairedAI.full_name}
                            </Badge>
                            <button
                                aria-label="Unpair Agent"
                                onClick={() => {
                                    startTransition(async () => {
                                        await unpairAIAgent(member.id)
                                        toast.success("Agent unpaired")
                                    })
                                }}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1 transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Unplug className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex flex-col gap-1.5 text-xs">
                        {!isAIAgent && (
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium w-fit", getBandwidth(member).className)}>
                                {getBandwidth(member).label}
                            </span>
                        )}
                        <div className="flex gap-3">
                            <span className="text-status-success font-medium">{member.completedTasks} done</span>
                            <span className="text-electric-blue font-medium">{member.activeTasks} active</span>
                            <span className="text-muted-foreground">{member.pendingTasks} pending</span>
                        </div>
                    </div>
                </td>
                <td className="px-4 py-3 text-right pr-6">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" aria-label={`Actions for ${member.full_name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedMemberId(member.id)}>
                                <User className="mr-2 h-4 w-4" /> View Profile
                            </DropdownMenuItem>
                            {!isAIAgent && (
                                <DropdownMenuItem onClick={async () => {
                                    const result = await startDirectMessage(member.id)
                                    if (result.success) toast.success(`Started conversation with ${member.full_name}`)
                                    else toast.error(result.error || 'Failed to start conversation')
                                }}>
                                    <MessageSquare className="mr-2 h-4 w-4" /> Message
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                onClick={() => setMemberToDelete(member.id)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> Remove
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </td>
            </tr>
        )
    }


    // ─── Member Grid Section ───────────────────

    const MemberSection = ({ title, subtitle, accentColor, icon, members }: {
        title: string
        subtitle: string
        accentColor: string
        icon?: React.ReactNode
        members: Member[]
    }) => {
        if (members.length === 0 && !searchQuery) return null

        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-muted pb-3">
                    <div className={cn("w-1 h-6 rounded-full", accentColor)} />
                    {icon}
                    <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
                    <Badge variant="secondary" className="text-xs font-normal">{members.length}</Badge>
                    <span className="text-sm text-muted-foreground">{subtitle}</span>
                </div>

                {members.length === 0 ? (
                    <EmptyState
                        icon={<Users className="h-8 w-8" />}
                        title={searchQuery ? `No ${title.toLowerCase()} match "${searchQuery}"` : `No ${title.toLowerCase()} yet`}
                        description={searchQuery ? "Try a different search term" : `Add ${title.toLowerCase()} to get started.`}
                        className="py-10 bg-muted/20 rounded-xl border border-muted"
                    />
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {members.map(member => (
                            <div
                                key={member.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, member.id)}
                                onDragOver={(e) => handleDragOver(e, member.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, member.id)}
                                onDragEnd={handleDragEnd}
                                className={cn(
                                    "cursor-grab active:cursor-grabbing active:scale-[0.98] transition-transform",
                                    draggedMemberId === member.id && "opacity-50 scale-95",
                                    dropTargetId === member.id && draggedMemberId !== member.id && "scale-[1.02]"
                                )}
                            >
                                {dropTargetId === member.id && draggedMemberId !== member.id && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-status-success-light/80 backdrop-blur-[2px] rounded-lg z-10 animate-in fade-in duration-200">
                                        <div className="bg-status-success text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg">
                                            <Zap className="h-4 w-4 fill-white" />
                                            Create Team
                                        </div>
                                    </div>
                                )}
                                <TeamMemberCard
                                    member={member}
                                    isSelected={selectedIds.has(member.id)}
                                    onToggleSelect={toggleSelection}
                                    size={cardSizes[member.id] || 'medium'}
                                    onSizeChange={handleCardSizeChange}
                                    onViewProfile={setSelectedMemberId}
                                    onMessage={member.role !== 'AI_Agent' ? handleMessage : undefined}
                                    onAddToTeam={handleAddToTeam}
                                    onTaskClick={handleTaskClick}
                                    presenceStatus={member.role === 'AI_Agent' ? 'online' : (getPresenceForUser(member.id)?.status as 'online' | 'away' | 'busy' | 'offline' || 'offline')}
                                    presence={member.role === 'AI_Agent' ? undefined : getPresenceForUser(member.id)}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="border border-muted rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-muted">
                                <tr>
                                    <th className="px-4 py-2.5 pl-6 text-xs font-medium uppercase tracking-wider">Profile</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Role</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">AI Partner</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Workload</th>
                                    <th className="px-4 py-2.5 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-background">
                                {members.map(member => (
                                    <MemberListItem key={member.id} member={member} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        )
    }


    // ─── Render ────────────────────────────────

    return (
        <div className="space-y-6">
            {/* ─── Header ─────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Team</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                        Manage your people, build teams, and track performance
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <RefreshButton />
                    {unassignedTasks && unassignedTasks.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => setShowQuickAssign(true)}
                            className="border-status-warning text-status-warning-dark hover:bg-status-warning-light"
                        >
                            <Zap className="h-4 w-4 mr-2" />
                            Quick Assign
                            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 h-4 bg-status-warning-light text-status-warning-dark">
                                {unassignedTasks.length}
                            </Badge>
                        </Button>
                    )}
                    <FeatureTip
                        id="team-invite"
                        title="Build Your Team"
                        description="Invite team members by email. Assign roles and they'll join your foundry automatically."
                        align="right"
                    >
                        <InviteMemberDialog />
                    </FeatureTip>
                    <Link href="/team/new">
                        <Button className="bg-international-orange hover:bg-international-orange/90 text-white shadow-sm">
                            <Plus className="h-4 w-4 mr-2" />
                            New Team
                        </Button>
                    </Link>
                </div>
            </div>

            {/* ─── Stats Row ──────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card border border-muted rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                    <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center shrink-0">
                        <Users className="h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <p className="text-2xl font-display font-bold text-foreground">{totalPeople}</p>
                        <p className="text-xs text-muted-foreground">People</p>
                    </div>
                </div>
                <div className="bg-card border border-muted rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                    <div className="h-10 w-10 rounded-xl bg-electric-blue/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5 text-electric-blue" />
                    </div>
                    <div>
                        <p className="text-2xl font-display font-bold text-foreground">{totalTeams}</p>
                        <p className="text-xs text-muted-foreground">Teams</p>
                    </div>
                </div>
                <div className="bg-card border border-muted rounded-xl p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                    <div className="h-10 w-10 rounded-xl bg-status-success/10 flex items-center justify-center shrink-0">
                        <Activity className="h-5 w-5 text-status-success" />
                    </div>
                    <div>
                        <p className="text-2xl font-display font-bold text-foreground">{avgCapacity}%</p>
                        <p className="text-xs text-muted-foreground">Avg Capacity</p>
                    </div>
                </div>
            </div>

            {/* ─── Smart Insights Bar ─────────────── */}
            {insights && (
                <SmartInsights
                    insights={insights}
                    onMemberClick={(id) => setSelectedMemberId(id)}
                    onQuickAssignClick={() => setShowQuickAssign(true)}
                />
            )}

            {/* ─── Tab Bar + Controls ─────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-muted pb-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-muted w-fit">
                    <button
                        onClick={() => { setActiveTab('members'); setSearchQuery("") }}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                            activeTab === 'members'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Users className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                        Members
                    </button>
                    <button
                        onClick={() => { setActiveTab('workload'); setSearchQuery("") }}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                            activeTab === 'workload'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <BarChart3 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                        Workload
                    </button>
                    <button
                        onClick={() => { setActiveTab('teams'); setSearchQuery("") }}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                            activeTab === 'teams'
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <ShieldCheck className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                        Teams
                        {totalTeams > 0 && (
                            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 h-4">{totalTeams}</Badge>
                        )}
                    </button>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={activeTab === 'members' ? "Search people..." : "Search teams..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 w-48 sm:w-56 bg-background border-muted text-sm"
                        />
                    </div>

                    {/* View toggle (members only) */}
                    {activeTab === 'members' && (
                        <ViewToggle
                            options={[
                                { value: 'grid', icon: LayoutGrid, ariaLabel: 'Grid view' },
                                { value: 'list', icon: List, ariaLabel: 'List view' },
                            ]}
                            value={viewMode}
                            onValueChange={(v) => setViewMode(v as 'grid' | 'list')}
                        />
                    )}
                </div>
            </div>

            {/* ─── Pending Invitations ────────────── */}
            <PendingInvitations />

            {/* ─── Members Tab ────────────────────── */}
            {activeTab === 'members' && (
                <div className="space-y-8">
                    {/* Team Analytics Charts */}
                    <TeamAnalytics members={allMembers} />

                    <MemberSection
                        title="Founders"
                        subtitle="Decision makers"
                        accentColor="bg-international-orange"
                        members={filteredFounders}
                    />
                    <MemberSection
                        title="Executives"
                        subtitle="Evaluators"
                        accentColor="bg-international-orange"
                        members={filteredExecutives}
                    />
                    <MemberSection
                        title="Apprentices"
                        subtitle="Executors"
                        accentColor="bg-muted-foreground"
                        members={filteredApprentices}
                    />
                </div>
            )}

            {/* ─── Workload Tab ────────────────────── */}
            {activeTab === 'workload' && allTasks && (
                <WorkloadBoard
                    members={allMembers.map(m => ({
                        id: m.id,
                        full_name: m.full_name || 'Unknown',
                        role: m.role,
                        avatar_url: null,
                        activeTasks: m.activeTasks,
                        pendingTasks: m.pendingTasks,
                    }))}
                    allTasks={allTasks}
                    onMemberClick={(id) => setSelectedMemberId(id)}
                    onTaskClick={handleTaskClick}
                />
            )}

            {/* ─── Teams Tab ─────────────────────── */}
            {activeTab === 'teams' && (
                <div className="space-y-6">
                    {filteredTeams.length === 0 ? (
                        <EmptyState
                            icon={<Users className="h-12 w-12" />}
                            title={searchQuery ? `No teams match "${searchQuery}"` : "No teams yet"}
                            description={searchQuery ? "Try a different search term" : "Create a team to group people for specific projects or missions."}
                            action={
                                !searchQuery ? (
                                    <Link href="/team/new">
                                        <Button className="bg-international-orange hover:bg-international-orange/90 text-white">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Create Your First Team
                                        </Button>
                                    </Link>
                                ) : undefined
                            }
                            className="py-16 bg-muted/20 rounded-xl border border-muted"
                        />
                    ) : (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {filteredTeams.map(team => (
                                <TeamDetailCard
                                    key={team.id}
                                    team={team}
                                    allTasks={allTasks || []}
                                    memberMetrics={allMembers.map(m => ({
                                        id: m.id,
                                        activeTasks: m.activeTasks,
                                        pendingTasks: m.pendingTasks,
                                    }))}
                                    onRename={(t) => { setTeamToEdit(t); setNewName(t.name) }}
                                    onDelete={(id) => setTeamToDelete(id)}
                                    onMemberClick={(id) => setSelectedMemberId(id)}
                                    onTaskClick={handleTaskClick}
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
                                    isDropTarget={dropTargetId === team.id}
                                />
                            ))}

                            {/* Add team card */}
                            <Link href="/team/new" className="block">
                                <Card className="bg-transparent border-2 border-dashed border-muted hover:border-international-orange/40 hover:bg-international-orange/5 transition-all h-full flex items-center justify-center min-h-[120px] cursor-pointer group/add">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover/add:text-international-orange transition-colors">
                                        <Plus className="h-6 w-6" />
                                        <span className="text-sm font-medium">New Team</span>
                                    </div>
                                </Card>
                            </Link>
                        </div>
                    )}
                </div>
            )}


            {/* ─── Modals & Dialogs ──────────────── */}

            {/* Comparison Modal */}
            <TeamComparisonModal
                open={showComparison}
                onOpenChange={setShowComparison}
                members={selectedMembers}
            />

            {/* Comparison Bar */}
            {!showComparison && (
                <TeamComparisonBar
                    selectedMembers={selectedMembers}
                    onClear={() => setSelectedIds(new Set())}
                    onCompare={() => setShowComparison(true)}
                    onRemove={(id) => {
                        const newSet = new Set(selectedIds)
                        newSet.delete(id)
                        setSelectedIds(newSet)
                    }}
                />
            )}

            {/* Quick Team Creation Dialog */}
            <Dialog open={showQuickTeamDialog} onOpenChange={setShowQuickTeamDialog}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Users className="h-5 w-5 text-international-orange" />
                            Create Team
                        </DialogTitle>
                        <DialogDescription>
                            {quickTeamMemberIds.length === 1
                                ? "Select additional members and name your team"
                                : "Name your new team with these members"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-center gap-4 py-3 flex-wrap">
                            {quickTeamMembers.map((member, idx) => (
                                <div key={member.id} className="flex flex-col items-center relative">
                                    <UserAvatar name={member.full_name} role={member.role} size="xl" className="border-2 border-international-orange/50" />
                                    <span className="text-sm font-medium text-foreground mt-2">{member.full_name?.split(' ')[0]}</span>
                                    {idx < quickTeamMembers.length - 1 && (
                                        <span className="absolute top-7 left-[calc(100%+0.5rem)] text-2xl text-international-orange">+</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {quickTeamMemberIds.length === 1 && (
                            <div className="space-y-2">
                                <Label>Add Members</Label>
                                <div className="max-h-40 overflow-y-auto border border-muted rounded-lg p-2 space-y-1">
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
                                                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                                    quickTeamMemberIds.includes(member.id)
                                                        ? "bg-international-orange/10 text-international-orange border border-international-orange/20"
                                                        : "hover:bg-muted"
                                                )}
                                            >
                                                {quickTeamMemberIds.includes(member.id) && <Check className="h-3 w-3" />}
                                                {member.full_name}
                                                <Badge variant="secondary" className="ml-auto text-[9px]">{member.role}</Badge>
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
                            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{teamError}</div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="secondary" onClick={() => {
                                setShowQuickTeamDialog(false)
                                setQuickTeamMemberIds([])
                                setTeamName("")
                            }}>Cancel</Button>
                            <Button
                                onClick={handleCreateQuickTeam}
                                disabled={isPending || !teamName.trim() || quickTeamMemberIds.length < 2}
                                className="bg-international-orange hover:bg-international-orange/90 text-white"
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
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setTeamToEdit(null)}>Cancel</Button>
                        <Button onClick={handleUpdateName} disabled={isPending || !newName.trim()} className="bg-international-orange hover:bg-international-orange/90 text-white">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Team Confirmation */}
            <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
                <AlertDialogContent className="bg-background text-foreground border-muted">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Team?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this team. Members will not be removed from your roster. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteTeam} className="bg-destructive hover:bg-destructive/90 focus:ring-destructive">
                            Delete Team
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Member Delete Confirmation */}
            <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
                <AlertDialogContent className="bg-background text-foreground border-muted">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
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
                        <AlertDialogAction onClick={handleDeleteMember} disabled={!!deletingMemberId} className="bg-destructive hover:bg-destructive/90 focus:ring-destructive">
                            {deletingMemberId ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing...</>
                            ) : "Remove Person"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Profile Modal */}
            <FullProfileView
                open={!!selectedMemberId}
                onOpenChange={(open) => !open && setSelectedMemberId(null)}
                memberId={selectedMemberId || ''}
                currentUserId={currentUserId}
            />

            {/* Task Modal */}
            {fullTaskData && (
                <FullTaskView
                    open={!!selectedTaskId && !!fullTaskData}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedTaskId(null)
                            setFullTaskData(null)
                        }
                    }}
                    task={fullTaskData}
                    members={allMembers.map(m => ({
                        id: m.id,
                        full_name: m.full_name || '',
                        email: m.email || '',
                        role: m.role,
                    }))}
                    currentUserId={currentUserId}
                />
            )}

            {/* Quick Assign Dialog */}
            {unassignedTasks && (
                <QuickAssignDialog
                    open={showQuickAssign}
                    onOpenChange={setShowQuickAssign}
                    unassignedTasks={unassignedTasks}
                    members={allMembers.map(m => ({
                        id: m.id,
                        full_name: m.full_name || 'Unknown',
                        role: m.role,
                        avatar_url: null,
                        activeTasks: m.activeTasks,
                        pendingTasks: m.pendingTasks,
                    }))}
                />
            )}
        </div>
    )
}
