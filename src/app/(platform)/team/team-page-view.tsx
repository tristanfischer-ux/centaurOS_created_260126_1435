'use client'

/**
 * TeamPageView — main Team page client component with header, view toggle,
 * interactive member cards, comparison, modals, and all team management features.
 *
 * @description Renders the page header (with orange accent bar, sub-tabs for
 * Members/Workload/Teams, List/Orbit toggle, and search), then conditionally
 * renders either the ListView, OrbitalView, WorkloadBoard, or Teams tab.
 * All interactive state (profile modals, task modals, comparison, team CRUD)
 * is managed here and passed down.
 */

import { useState, useCallback, useTransition, useMemo, useEffect } from 'react'
import {
    Plus, Search, LayoutGrid, List, Users,
    BarChart3, ShieldCheck, Zap, MoreHorizontal, Loader2,
    AlertTriangle, Check, Store, Orbit, Settings, CalendarDays,
    Handshake, Briefcase,
} from 'lucide-react'
import { ViewToggle } from '@/components/ui/view-toggle'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { UserAvatar } from '@/components/ui/user-avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system'
import { useRegisterScreenContext } from '@/contexts/screen-context'
import { cn } from '@/lib/utils'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { RefreshButton } from '@/components/RefreshButton'
import { usePresenceContext } from '@/components/PresenceProvider'
import { createTeam, addTeamMember, deleteMember } from '@/actions/team'
import { startDirectMessage } from '@/actions/messaging'
import { deleteTeam, updateTeamName } from '@/actions/teams'
import { pairAIAgent, unpairAIAgent } from '@/actions/team'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'

// View components
import { HiringTimeline } from './hiring-timeline'
import { OrbitalView } from './components/orbital-view'
import { WorkloadBoard } from './workload-board'
import { TeamDetailCard } from './team-detail-card'
import { SmartInsights } from './smart-insights'
import { QuickAssignDialog } from './quick-assign-dialog'
import { InviteMemberDialog } from './invite-member-dialog'
import { PendingInvitations } from './pending-invitations'
import { EditFunctionsDialog } from './components/edit-functions-dialog'

// Shared components
import { FullProfileView } from '@/components/team/full-profile-view'
import { FullTaskView } from '@/components/tasks/full-task-view'
import { TeamComparisonBar } from '@/components/team/team-comparison-bar'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { TeamComparisonModal } from '@/components/team/team-comparison-modal'
import { TeamMemberCard, type CardSize } from '@/components/team/team-member-card'

const TeamAnalytics = dynamic(
  () => import('@/components/team/team-analytics').then((m) => ({ default: m.TeamAnalytics })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px] rounded-lg" /> },
)

import { useTeamData } from './hooks/use-team-data'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { RetainerCard } from '@/components/retainers'
import type { RetainerWithDetails, RetainerStats } from '@/types/retainers'
import type { TeamViewMode, BusinessFunction } from './types'

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
    full_name: string
    email?: string | null
    bio?: string | null
    phone_number?: string | null
    role: string
    avatar_url?: string | null
    primary_function_id?: string | null
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

/** Marketplace People listing passed from server */
export interface MarketplacePersonListing {
    id: string
    title: string
    subcategory: string
    description: string | null
    attributes: Record<string, unknown>
}

/** Coverage summary per function category from server */
export interface CoverageSummaryEntry {
    category: string
    hasPartialOrCovered: boolean
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

interface TeamPageViewProps {
    founders: Member[]
    executives: Member[]
    apprentices: Member[]
    teams: Team[]
    currentUserId: string
    insights?: Insights
    unassignedTasks?: ExtendedTask[]
    allTasks?: ExtendedTask[]
    /** Marketplace People listings for orbit outer ring + card section */
    marketplacePeople?: MarketplacePersonListing[]
    /** Mapping from business_function.id → category (e.g. 'finance', 'sales') */
    functionCategoryMap?: Record<string, string>
    /** Business function definitions (custom or default) */
    orbitFunctions?: BusinessFunction[]
    /** Foundry ID for editing functions */
    foundryId?: string
    /** Hiring requirements from business plan analysis */
    hiringRequirements?: import('@/lib/business-plan-types').SavedHiringRequirement[]
    /** Retainers with stats, fetched server-side */
    retainersWithStats?: { retainer: RetainerWithDetails; stats: RetainerStats | null }[]
    /** Count of retainers where user is buyer */
    buyerRetainerCount?: number
    /** Count of retainers where user is seller/provider */
    sellerRetainerCount?: number
}

type ActiveTab = 'members' | 'workload' | 'teams' | 'hiring'

// ─── Main Component ───────────────────────────────

export function TeamPageView({
    founders,
    executives,
    apprentices,
    teams,
    currentUserId,
    insights,
    unassignedTasks,
    allTasks,
    marketplacePeople = [],
    functionCategoryMap = {},
    orbitFunctions = [
        { id: 'sales', label: 'Sales', short: 'SALES' },
        { id: 'marketing', label: 'Marketing', short: 'MKTG' },
        { id: 'finance', label: 'Finance', short: 'FIN' },
        { id: 'hr', label: 'People & HR', short: 'HR' },
        { id: 'legal', label: 'Legal & Admin', short: 'LEGAL' },
        { id: 'operations', label: 'Operations', short: 'OPS' },
        { id: 'product', label: 'Product', short: 'PROD' },
    ],
    foundryId,
    hiringRequirements = [],
    retainersWithStats = [],
    buyerRetainerCount = 0,
    sellerRetainerCount = 0,
}: TeamPageViewProps) {
    // View state — orbit is the default landing view
    const [viewMode, setViewMode] = useState<TeamViewMode>('orbit')
    const [activeTab, setActiveTab] = useState<ActiveTab>('members')
    const [searchQuery, setSearchQuery] = useState('')

    // Selection & comparison
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showComparison, setShowComparison] = useState(false)

    // Profile & task modals
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [fullTaskData, setFullTaskData] = useState<Database['public']['Tables']['tasks']['Row'] | null>(null)
    const [isLoadingTask, setIsLoadingTask] = useState(false)

    // Register screen context so specialists know what the user is viewing
    const totalMembers = founders.length + executives.length + apprentices.length
    useRegisterScreenContext(useMemo(() => ({
        pageTitle: 'Team',
        summary: `Viewing the team page. ${totalMembers} team members: ${founders.length} founders, ${executives.length} executives, ${apprentices.length} apprentices. ${teams.length} teams.${insights?.overloadedMembers?.length ? ` ${insights.overloadedMembers.length} overloaded members.` : ''}${insights?.overdueTaskCount ? ` ${insights.overdueTaskCount} overdue tasks.` : ''}`,
        entities: [
            ...founders.map(m => ({ type: 'founder', title: m.full_name || 'Unknown', status: 'active' })),
            ...executives.map(m => ({ type: 'executive', title: m.full_name || 'Unknown', status: 'active' })),
            ...apprentices.map(m => ({ type: 'apprentice', title: m.full_name || 'Unknown', status: 'active' })),
        ],
    }), [founders, executives, apprentices, teams, insights, totalMembers]))

    // Quick assign
    const [showQuickAssign, setShowQuickAssign] = useState(false)

    // Edit functions dialog
    const [showEditFunctions, setShowEditFunctions] = useState(false)

    // Drag-and-drop state
    const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)

    // Quick team creation
    const [showQuickTeamDialog, setShowQuickTeamDialog] = useState(false)
    const [quickTeamMemberIds, setQuickTeamMemberIds] = useState<string[]>([])
    const [teamName, setTeamName] = useState('')
    const [teamError, setTeamError] = useState<string | null>(null)

    // Team management
    const [teamToEdit, setTeamToEdit] = useState<{ id: string; name: string } | null>(null)
    const [teamToDelete, setTeamToDelete] = useState<string | null>(null)
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
    const [newName, setNewName] = useState('')
    const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)

    // Card sizes
    const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>({})

    // Transitions
    const [isPending, startTransition] = useTransition()

    // Presence & auto-refresh
    const { getPresenceForUser } = usePresenceContext()
    useAutoRefresh({ tables: ['profiles', 'teams', 'presence'] })

    // Derived data
    const allMembers = [...founders, ...executives, ...apprentices]
    const selectedMembers = allMembers.filter(m => selectedIds.has(m.id))
    const quickTeamMembers = allMembers.filter(m => quickTeamMemberIds.includes(m.id))
    const humanMembers = allMembers.filter(m => m.role !== 'AI_Agent')

    // Stats
    const totalPeople = allMembers.length
    const totalTeams = teams.filter(t => !t.is_auto_generated).length
    const avgCapacity = humanMembers.length > 0
        ? Math.round(humanMembers.reduce((sum, m) => {
            const score = Math.min(100, (m.activeTasks * 20) + (m.pendingTasks * 10))
            return sum + (100 - score)
        }, 0) / humanMembers.length)
        : 100

    // Orbit hero mode — when active, use compact layout with orbit as hero
    const isOrbitActive = activeTab === 'members' && viewMode === 'orbit'

    // ─── Computed orbit data (shared across all views) ────
    const teamData = useTeamData({
        founders: founders.map(m => ({
            id: m.id,
            full_name: m.full_name,
            role: m.role,
            avatar_url: m.avatar_url ?? null,
            primary_function_id: m.primary_function_id ?? null,
            activeTasks: m.activeTasks,
            completedTasks: m.completedTasks,
            pendingTasks: m.pendingTasks,
        })),
        executives: executives.map(m => ({
            id: m.id,
            full_name: m.full_name,
            role: m.role,
            avatar_url: m.avatar_url ?? null,
            primary_function_id: m.primary_function_id ?? null,
            activeTasks: m.activeTasks,
            completedTasks: m.completedTasks,
            pendingTasks: m.pendingTasks,
        })),
        apprentices: apprentices.map(m => ({
            id: m.id,
            full_name: m.full_name,
            role: m.role,
            avatar_url: m.avatar_url ?? null,
            primary_function_id: m.primary_function_id ?? null,
            activeTasks: m.activeTasks,
            completedTasks: m.completedTasks,
            pendingTasks: m.pendingTasks,
        })),
        marketplacePeople,
        functionCategoryMap,
        functions: orbitFunctions,
    })

    /** Marketplace candidates visible in orbit, ordered by function */
    const orbitVisibleCandidates = useMemo(() => {
        return orbitFunctions.flatMap(fn => {
            const candidates = teamData.marketplaceByFunction[fn.id] || []
            return candidates.slice(0, 4).map(c => ({
                ...c,
                functionLabel: fn.label,
                functionId: fn.id,
            }))
        })
    }, [teamData.marketplaceByFunction, orbitFunctions])

    // ─── Search Filter ─────────────────────────

    const filterMembers = (members: Member[]): Member[] => {
        if (!searchQuery.trim()) return members
        const q = searchQuery.toLowerCase()
        return members.filter(m =>
            m.full_name?.toLowerCase().includes(q) ||
            m.role?.toLowerCase().includes(q) ||
            m.email?.toLowerCase().includes(q)
        )
    }

    const filterTeams = (teamsList: Team[]): Team[] => {
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

    const toggleSelection = (id: string): void => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else if (newSet.size < 4) {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleMessage = async (memberId: string): Promise<void> => {
        const member = allMembers.find(m => m.id === memberId)
        const result = await startDirectMessage(memberId)
        if (result.success) {
            toast.success(`Started conversation with ${member?.full_name || 'member'}`)
        } else {
            toast.error(result.error || 'Failed to start conversation')
        }
    }

    const handleAddToTeam = (memberId: string): void => {
        setQuickTeamMemberIds([memberId])
        setTeamName('')
        setTeamError(null)
        setShowQuickTeamDialog(true)
    }

    const handleTaskClick = useCallback(async (taskId: string): Promise<void> => {
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
    const handleDragStart = (e: React.DragEvent, memberId: string): void => {
        setDraggedMemberId(memberId)
        e.dataTransfer.setData('text/plain', memberId)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent, memberId: string): void => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const draggedId = draggedMemberId || e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== memberId) {
            setDropTargetId(memberId)
        }
    }

    const handleDragLeave = (): void => { setDropTargetId(null) }

    const handleDrop = (e: React.DragEvent, targetMemberId: string): void => {
        e.preventDefault()
        const draggedId = e.dataTransfer.getData('text/plain') || draggedMemberId
        const draggedMember = allMembers.find(m => m.id === draggedId)
        const targetMember = allMembers.find(m => m.id === targetMemberId)

        if (draggedMember && targetMember) {
            // AI pairing logic
            if (draggedMember.role === 'AI_Agent' && targetMember.role !== 'AI_Agent') {
                startTransition(async () => {
                    const res = await pairAIAgent(targetMember.id, draggedMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${targetMember.full_name} with ${draggedMember.full_name}`)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
            if (draggedMember.role !== 'AI_Agent' && targetMember.role === 'AI_Agent') {
                startTransition(async () => {
                    const res = await pairAIAgent(draggedMember.id, targetMember.id)
                    if (res?.error) toast.error(res.error)
                    else toast.success(`Paired ${draggedMember.full_name} with ${targetMember.full_name}`)
                })
                setDraggedMemberId(null)
                setDropTargetId(null)
                return
            }
        }

        // Team creation from drag-drop
        if (draggedId && draggedId !== targetMemberId) {
            setQuickTeamMemberIds([draggedId, targetMemberId])
            setTeamName('')
            setTeamError(null)
            setShowQuickTeamDialog(true)
        }
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    const handleDragEnd = (): void => {
        setDraggedMemberId(null)
        setDropTargetId(null)
    }

    // Team management handlers
    const handleUpdateName = async (): Promise<void> => {
        if (!teamToEdit || !newName.trim()) return
        startTransition(async () => {
            try {
                await updateTeamName(teamToEdit.id, newName)
                setTeamToEdit(null)
                setNewName('')
            } catch (error) {
                console.error('[TeamPage] Failed to rename team:', error)
            }
        })
    }

    const handleDeleteTeam = async (): Promise<void> => {
        if (!teamToDelete) return
        startTransition(async () => {
            const result = await deleteTeam(teamToDelete)
            if (result?.error) toast.error(result.error)
            else setTeamToDelete(null)
        })
    }

    const handleDeleteMember = async (): Promise<void> => {
        if (!memberToDelete) return
        setDeletingMemberId(memberToDelete)
        startTransition(async () => {
            const res = await deleteMember(memberToDelete)
            if (res?.error) toast.error(res.error)
            else {
                toast.success('Member removed')
                setMemberToDelete(null)
            }
            setDeletingMemberId(null)
        })
    }

    const handleCreateQuickTeam = (): void => {
        if (!teamName.trim()) {
            setTeamError('Team name is required')
            return
        }
        setTeamError(null)
        startTransition(async () => {
            const result = await createTeam(teamName.trim(), quickTeamMemberIds)
            if (result.error) setTeamError(result.error)
            else {
                setShowQuickTeamDialog(false)
                setQuickTeamMemberIds([])
                setTeamName('')
            }
        })
    }

    // ─── Marketplace Candidates Section (by function, matching orbit) ──────

    type OrbitCandidate = typeof orbitVisibleCandidates[number]

    const MarketplaceCandidatesSection = ({ candidates, searchQuery: sq, displayMode }: {
        candidates: OrbitCandidate[]
        searchQuery: string
        displayMode: 'cards' | 'list'
    }) => {
        const filtered = sq.trim()
            ? candidates.filter(c => {
                const q = sq.toLowerCase()
                return (
                    c.name.toLowerCase().includes(q) ||
                    c.role.toLowerCase().includes(q) ||
                    c.functionLabel.toLowerCase().includes(q) ||
                    c.tags.some(t => t.toLowerCase().includes(q))
                )
            })
            : candidates

        if (filtered.length === 0 && !sq) return null

        // Group by function (preserving orbitFunctions order)
        const byFunction = orbitFunctions
            .map(fn => ({
                fn,
                items: filtered.filter(c => c.functionId === fn.id),
            }))
            .filter(g => g.items.length > 0)

        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-muted pb-3">
                    <div className="w-1 h-6 rounded-full bg-electric-blue" />
                    <Store className="h-5 w-5 text-electric-blue" />
                    <h2 className="text-lg font-display font-semibold text-foreground">Marketplace Candidates</h2>
                    <Badge variant="secondary" className="text-xs font-normal">{filtered.length}</Badge>
                    <span className="text-sm text-muted-foreground">Vetted professionals available for hire</span>
                </div>

                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<Store className="h-8 w-8" />}
                        title={`No marketplace candidates match "${sq}"`}
                        description="Try a different search term"
                        className="py-10 bg-muted/20 rounded-xl border border-muted"
                    />
                ) : displayMode === 'cards' ? (
                    <div className="space-y-6">
                        {byFunction.map(({ fn, items }) => (
                            <div key={fn.id} className="space-y-3">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    {fn.label} ({items.length})
                                </h3>
                                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {items.map((c) => (
                                        <MarketplaceCandidateCard key={c.id} candidate={c} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* List (table) display */
                    <div className="border border-muted rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-muted">
                                <tr>
                                    <th className="px-4 py-2.5 pl-6 text-xs font-medium uppercase tracking-wider">Candidate</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Function</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Type</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Rate</th>
                                    <th className="px-4 py-2.5 w-24"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-background">
                                {byFunction.flatMap(({ items }) => items).map(c => {
                                    const listing = marketplacePeople.find(mp => mp.id === c.id)
                                    return (
                                        <tr
                                            key={c.id}
                                            className="group hover:bg-muted/50 transition-colors duration-150 border-b border-muted last:border-0"
                                        >
                                            <td className="px-4 py-3 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <UserAvatar name={c.name} role={c.type === 'exec' ? 'Executive' : 'Apprentice'} size="sm" />
                                                    <div>
                                                        <span className="font-medium text-foreground">{c.name}</span>
                                                        <div className="text-xs text-muted-foreground">{c.role}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant="secondary" className="text-[10px] font-normal">{c.functionLabel}</Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    variant="info"
                                                    className="text-[10px]"
                                                >
                                                    {c.type === 'exec' ? 'Executive' : 'Apprentice'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground text-xs font-medium">
                                                {c.hourlyRate}
                                            </td>
                                            <td className="px-4 py-3 text-right pr-6">
                                                <Link
                                                    href={listing ? `/marketplace/${listing.id}` : '/marketplace'}
                                                    className="text-xs font-semibold text-electric-blue hover:underline"
                                                >
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        )
    }

    /** Single marketplace candidate card for the cards view */
    const MarketplaceCandidateCard = ({ candidate: c }: { candidate: OrbitCandidate }) => {
        const listing = marketplacePeople.find(mp => mp.id === c.id)
        const isExec = c.type === 'exec'

        return (
            <div className="bg-card border border-muted rounded-xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all group">
                <div className="flex items-start gap-3 mb-3">
                    <UserAvatar name={c.name} role={isExec ? 'Executive' : 'Apprentice'} size="lg" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.role}</div>
                    </div>
                    <Badge variant="secondary" className="text-[9px] shrink-0">
                        {c.functionLabel}
                    </Badge>
                </div>

                {/* Rate */}
                <div className="text-xs text-foreground font-semibold mb-2">{c.hourlyRate}</div>

                {/* Skills */}
                {c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                        {c.tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-muted">
                    <Link
                        href={listing ? `/marketplace/${listing.id}` : '/marketplace'}
                        className="flex-1 text-center text-xs font-semibold text-electric-blue hover:underline py-1.5"
                    >
                        View Profile
                    </Link>
                    <Link
                        href={listing ? `/marketplace/${listing.id}/book` : '/marketplace'}
                        className="flex-1 text-center text-xs font-semibold text-white bg-international-orange hover:bg-international-orange/90 rounded-lg py-1.5 transition-colors"
                    >
                        Onboard
                    </Link>
                </div>
            </div>
        )
    }

    // ─── Member Section (grid/list) ──────────────

    const MemberSection = ({ title, subtitle, accentColor, members }: {
        title: string
        subtitle: string
        accentColor: string
        members: Member[]
    }) => {
        if (members.length === 0 && !searchQuery) return null

        return (
            <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-muted pb-3">
                    <div className={cn('w-1 h-6 rounded-full', accentColor)} />
                    <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
                    <Badge variant="secondary" className="text-xs font-normal">{members.length}</Badge>
                    <span className="text-sm text-muted-foreground">{subtitle}</span>
                </div>

                {members.length === 0 ? (
                    <EmptyState
                        icon={<Users className="h-8 w-8" />}
                        title={searchQuery ? `No ${title.toLowerCase()} match "${searchQuery}"` : `No ${title.toLowerCase()} yet`}
                        description={searchQuery ? 'Try a different search term' : `Add ${title.toLowerCase()} to get started.`}
                        className="py-10 bg-muted/20 rounded-xl border border-muted"
                    />
                ) : viewMode === 'cards' ? (
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
                                    'cursor-grab active:cursor-grabbing active:scale-[0.98] transition-transform relative',
                                    draggedMemberId === member.id && 'opacity-50 scale-95',
                                    dropTargetId === member.id && draggedMemberId !== member.id && 'scale-[1.02]'
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
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left min-w-[480px]">
                            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-muted">
                                <tr>
                                    <th className="px-4 py-2.5 pl-6 text-xs font-medium uppercase tracking-wider">Profile</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Role</th>
                                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider">Workload</th>
                                    <th className="px-4 py-2.5 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-background">
                                {members.map(member => (
                                    <tr
                                        key={member.id}
                                        className="group hover:bg-muted/50 active:bg-muted transition-colors duration-150 border-b border-muted last:border-0 cursor-pointer"
                                        onClick={() => setSelectedMemberId(member.id)}
                                    >
                                        <td className="px-4 py-3 pl-6">
                                            <div className="flex items-center gap-3">
                                                <UserAvatar name={member.full_name} role={member.role} size="sm" />
                                                <span className="font-medium text-foreground group-hover:text-electric-blue transition-colors">
                                                    {member.full_name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="secondary" className="text-[10px] font-normal">
                                                {member.role}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            <div className="flex gap-3 text-xs">
                                                <span className="text-status-success font-medium">{member.completedTasks} done</span>
                                                <span className="text-electric-blue font-medium">{member.activeTasks} active</span>
                                                <span className="text-muted-foreground">{member.pendingTasks} pending</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right pr-6">
                                            <Button
                                                variant="ghost"
                                                className="h-8 w-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label={`Actions for ${member.full_name}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setSelectedMemberId(member.id)
                                                }}
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </div>
                )}
            </section>
        )
    }

    // ─── Render ─────────────────────────────────

    return (
        <div className={cn(isOrbitActive ? 'space-y-2' : 'space-y-6')}>
            {/* ── Header (consistent across all view modes) ──────── */}
            <div className="space-y-2">
                {/* Row 1: Title + Controls */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className={typography.pageHeaderAccent} />
                        <h1 className="text-xl font-display font-bold text-foreground">Team</h1>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <div className="hidden md:flex items-center gap-2">
                            <ViewToggle
                                options={[
                                    { value: 'orbit', label: 'Orbit', icon: Orbit, ariaLabel: 'Orbit view' },
                                    { value: 'cards', icon: LayoutGrid, ariaLabel: 'Cards view' },
                                    { value: 'list', icon: List, ariaLabel: 'List view' },
                                ]}
                                value={viewMode}
                                onValueChange={(v) => setViewMode(v as 'orbit' | 'cards' | 'list')}
                            />
                            {foundryId && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowEditFunctions(true)}
                                >
                                    <Settings className="h-4 w-4" />
                                    Functions
                                </Button>
                            )}
                            <AskSpecialistButton
                                context={{
                                    type: 'general',
                                    title: 'Team & Hiring',
                                    description: `Team overview: ${totalPeople} members (${founders.length} founders, ${executives.length} executives, ${apprentices.length} apprentices), ${totalTeams} teams, ${avgCapacity}% avg capacity remaining.`,
                                    metadata: {
                                        notes: insights?.overloadedMembers?.length
                                            ? `${insights.overloadedMembers.length} overloaded members. ${insights.overdueTaskCount || 0} overdue tasks.`
                                            : undefined,
                                    },
                                }}
                                specialistId="hiring-team"
                                specialistName="Harper"
                                variant="chip"
                                label="Ask Harper"
                            />
                            <RefreshButton />
                        </div>
                        <InviteMemberDialog />
                        <Link href="/team/new">
                            <Button size="sm" className="bg-international-orange hover:bg-international-orange/90 text-white shadow-sm">
                                <Plus className="h-4 w-4" />
                                <span className="hidden sm:inline">New Team</span>
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Row 2: Tabs + mobile view toggle */}
                <div className="flex items-center gap-2">
                    <div role="tablist" aria-label="Team views" className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-muted overflow-x-auto scrollbar-none">
                        <button
                            role="tab"
                            aria-selected={activeTab === 'members'}
                            aria-controls="team-members-panel"
                            id="team-members-tab"
                            onClick={() => { setActiveTab('members'); setSearchQuery('') }}
                            className={cn(
                                'px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0',
                                activeTab === 'members'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Users className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                            Members
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'workload'}
                            aria-controls="team-workload-panel"
                            id="team-workload-tab"
                            onClick={() => { setActiveTab('workload'); setSearchQuery('') }}
                            className={cn(
                                'px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0',
                                activeTab === 'workload'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <BarChart3 className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                            Workload
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'teams'}
                            aria-controls="team-teams-panel"
                            id="team-teams-tab"
                            onClick={() => { setActiveTab('teams'); setSearchQuery('') }}
                            className={cn(
                                'px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0',
                                activeTab === 'teams'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <ShieldCheck className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                            Teams
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'hiring'}
                            aria-controls="team-hiring-panel"
                            id="team-hiring-tab"
                            onClick={() => { setActiveTab('hiring'); setSearchQuery('') }}
                            className={cn(
                                'px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0',
                                activeTab === 'hiring'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <CalendarDays className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                            Hiring<span className="hidden sm:inline"> Plan</span>
                            {hiringRequirements.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                                    {hiringRequirements.length}
                                </Badge>
                            )}
                        </button>
                    </div>

                    {/* Mobile-only view toggle */}
                    <div className="flex md:hidden shrink-0">
                        <ViewToggle
                            options={[
                                { value: 'orbit', label: 'Orbit', icon: Orbit, ariaLabel: 'Orbit view' },
                                { value: 'cards', icon: LayoutGrid, ariaLabel: 'Cards view' },
                                { value: 'list', icon: List, ariaLabel: 'List view' },
                            ]}
                            value={viewMode}
                            onValueChange={(v) => setViewMode(v as 'orbit' | 'cards' | 'list')}
                        />
                    </div>
                </div>
            </div>

            {/* ── Stats & Insights Pills (hidden in orbit mode — shown in bottom bar) ── */}
            {!isOrbitActive && (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                    {/* Stat pills — same size as insight pills */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-muted bg-card shrink-0 transition-all">
                        <Users className="h-4 w-4 text-international-orange shrink-0" />
                        <span className="text-sm font-semibold text-foreground">{totalPeople}</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">People</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-muted bg-card shrink-0 transition-all">
                        <ShieldCheck className="h-4 w-4 text-electric-blue shrink-0" />
                        <span className="text-sm font-semibold text-foreground">{totalTeams}</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Teams</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-muted bg-card shrink-0 transition-all">
                        <BarChart3 className="h-4 w-4 text-status-success shrink-0" />
                        <span className="text-sm font-semibold text-foreground">{avgCapacity}%</span>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Avg Capacity</span>
                    </div>
                    {/* Insight pills — rendered inline via display:contents */}
                    {insights && (
                        <SmartInsights
                            insights={insights}
                            onMemberClick={(id) => setSelectedMemberId(id)}
                            onQuickAssignClick={() => setShowQuickAssign(true)}
                            className="contents"
                        />
                    )}
                </div>
            )}

            {/* ── Search + Quick Assign (non-orbit modes only) ──── */}
            {!isOrbitActive && (
            <div className="flex items-center justify-between gap-3 border-b border-muted pb-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={activeTab === 'members' ? 'Search people...' : activeTab === 'teams' ? 'Search teams...' : 'Search...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 w-48 sm:w-56 bg-background border-muted text-sm"
                    />
                </div>
                {unassignedTasks && unassignedTasks.length > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowQuickAssign(true)}
                        className="border-status-warning text-status-warning-dark hover:bg-status-warning-light h-8"
                    >
                        <Zap className="h-3.5 w-3.5 mr-1.5" />
                        Quick Assign
                        <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 h-4 bg-status-warning-light text-status-warning-dark">
                            {unassignedTasks.length}
                        </Badge>
                    </Button>
                )}
            </div>
            )}

            {/* ── Pending Invitations ─────────────────────────────── */}
            {!isOrbitActive && <PendingInvitations />}

            {/* ── Content ─────────────────────────────────────────── */}

            {/* Members Tab — Orbit View (hero layout) */}
            {isOrbitActive && (
                <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
                    <div className="h-[calc(100vh-12rem)] md:h-[calc(100vh-7rem)] overflow-hidden flex">
                        <OrbitalView
                            teamData={teamData}
                            functions={orbitFunctions}
                            onViewProfile={setSelectedMemberId}
                        />
                    </div>
                    {/* ── Bottom Info Bar ── */}
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-10">
                        <div className="pointer-events-auto flex items-center gap-2.5 bg-background/80 backdrop-blur-sm border border-muted rounded-full px-5 py-2.5 shadow-lg">
                            <div className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-international-orange" />
                                <span className="font-semibold text-foreground text-sm">{totalPeople}</span>
                                <span className="text-muted-foreground text-xs">People</span>
                            </div>
                            <div className="w-px h-4 bg-muted" />
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck className="h-3.5 w-3.5 text-electric-blue" />
                                <span className="font-semibold text-foreground text-sm">{totalTeams}</span>
                                <span className="text-muted-foreground text-xs">Teams</span>
                            </div>
                            <div className="w-px h-4 bg-muted" />
                            <div className="flex items-center gap-1.5">
                                <BarChart3 className="h-3.5 w-3.5 text-status-success" />
                                <span className="font-semibold text-foreground text-sm">{avgCapacity}%</span>
                                <span className="text-muted-foreground text-xs">Capacity</span>
                            </div>
                            {insights && insights.unassignedTaskCount > 0 && (
                                <>
                                    <div className="w-px h-4 bg-muted" />
                                    <button
                                        onClick={() => setShowQuickAssign(true)}
                                        className="flex items-center gap-1.5 hover:bg-status-warning-light/50 rounded-full px-2 py-0.5 transition-colors"
                                    >
                                        <Zap className="h-3.5 w-3.5 text-status-warning" />
                                        <span className="font-semibold text-status-warning-dark text-sm">{insights.unassignedTaskCount}</span>
                                        <span className="text-muted-foreground text-xs">unassigned</span>
                                    </button>
                                </>
                            )}
                            {insights && insights.overloadedMembers.length > 0 && (
                                <>
                                    <div className="w-px h-4 bg-muted" />
                                    <div className="flex items-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5 text-status-error" />
                                        <span className="font-semibold text-status-error-dark text-sm">{insights.overloadedMembers.length}</span>
                                        <span className="text-muted-foreground text-xs">overloaded</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Members Tab — Cards View */}
            {activeTab === 'members' && viewMode === 'cards' && (
                <div className="space-y-8">
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
                        accentColor="bg-international-orange/60"
                        members={filteredExecutives}
                    />
                    <MemberSection
                        title="Apprentices"
                        subtitle="Executors"
                        accentColor="bg-muted-foreground"
                        members={filteredApprentices}
                    />

                    {/* Marketplace Candidates — same set as orbit, ordered by function */}
                    {orbitVisibleCandidates.length > 0 && (
                        <MarketplaceCandidatesSection
                            candidates={orbitVisibleCandidates}
                            searchQuery={searchQuery}
                            displayMode="cards"
                        />
                    )}
                </div>
            )}

            {/* Members Tab — List View */}
            {activeTab === 'members' && viewMode === 'list' && (
                <div className="space-y-8">
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
                        accentColor="bg-international-orange/60"
                        members={filteredExecutives}
                    />
                    <MemberSection
                        title="Apprentices"
                        subtitle="Executors"
                        accentColor="bg-muted-foreground"
                        members={filteredApprentices}
                    />

                    {/* Marketplace Candidates — same set as orbit, ordered by function */}
                    {orbitVisibleCandidates.length > 0 && (
                        <MarketplaceCandidatesSection
                            candidates={orbitVisibleCandidates}
                            searchQuery={searchQuery}
                            displayMode="list"
                        />
                    )}
                </div>
            )}

            {/* Workload Tab */}
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

            {/* Teams Tab */}
            {activeTab === 'teams' && (
                <div className="space-y-6">
                    {filteredTeams.length === 0 ? (
                        <EmptyState
                            icon={<Users className="h-12 w-12" />}
                            title={searchQuery ? `No teams match "${searchQuery}"` : 'No teams yet'}
                            description={searchQuery ? 'Try a different search term' : 'Create a team to group people for specific projects or missions.'}
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
                                <div className="bg-transparent border-2 border-dashed border-muted hover:border-international-orange/40 hover:bg-international-orange/5 transition-all h-full flex items-center justify-center min-h-[120px] cursor-pointer group/add rounded-xl">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover/add:text-international-orange transition-colors">
                                        <Plus className="h-6 w-6" />
                                        <span className="text-sm font-medium">New Team</span>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    )}
                </div>
            )}

            {/* Hiring Plan Tab */}
            {activeTab === 'hiring' && (
                <div id="team-hiring-panel" role="tabpanel" aria-labelledby="team-hiring-tab">
                    <HiringTimeline requirements={hiringRequirements} />
                </div>
            )}

            {/* ── Retainers Section ─────────────────────────────── */}
            <section className="space-y-4 pt-4 border-t border-muted">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-6 rounded-full bg-electric-blue" />
                        <Handshake className="h-5 w-5 text-electric-blue" />
                        <h2 className="text-lg font-display font-semibold text-foreground">Retainers</h2>
                        {retainersWithStats.length > 0 && (
                            <Badge variant="secondary" className="text-xs font-normal">{retainersWithStats.length}</Badge>
                        )}
                    </div>
                    <Button size="sm" variant="outline" asChild>
                        <Link href="/marketplace?category=People">
                            <Plus className="h-4 w-4" />
                            New Retainer
                        </Link>
                    </Button>
                </div>

                {retainersWithStats.length === 0 ? (
                    <EmptyState
                        icon={<Handshake className="h-10 w-10" />}
                        title="No retainer agreements yet"
                        description="Set up retainers with freelancers and experts from the Marketplace to manage ongoing engagements."
                        action={
                            <Button asChild className="bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href="/marketplace?category=People">
                                    <Briefcase className="h-4 w-4 mr-2" />
                                    Browse People
                                </Link>
                            </Button>
                        }
                        className="py-12 bg-muted/20 rounded-xl border border-muted"
                    />
                ) : (
                    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                        {retainersWithStats.map(({ retainer, stats }) => (
                            <RetainerCard
                                key={retainer.id}
                                retainer={retainer}
                                stats={stats}
                                role={retainer.buyer_id === currentUserId ? 'buyer' : 'seller'}
                                compact
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ── Modals & Dialogs ──────────────────────────────── */}

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
                                ? 'Select additional members and name your team'
                                : 'Name your new team with these members'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-center gap-4 py-3 flex-wrap">
                            {quickTeamMembers.map((member, idx) => (
                                <div key={member.id} className="flex flex-col items-center relative">
                                    <UserAvatar name={member.full_name} role={member.role} size="xl" />
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
                                                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                                                    quickTeamMemberIds.includes(member.id)
                                                        ? 'bg-international-orange/10 text-international-orange border border-international-orange/20'
                                                        : 'hover:bg-muted'
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
                                setTeamName('')
                            }}>Cancel</Button>
                            <Button
                                onClick={handleCreateQuickTeam}
                                disabled={isPending || !teamName.trim() || quickTeamMemberIds.length < 2}
                                className="bg-international-orange hover:bg-international-orange/90 text-white"
                            >
                                {isPending ? 'Creating...' : 'Create Team'}
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
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Save Changes'}
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
                            ) : 'Remove Person'}
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
            {fullTaskData ? (
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
            ) : selectedTaskId && isLoadingTask ? (
                <Dialog open onOpenChange={() => { setSelectedTaskId(null); setIsLoadingTask(false) }}>
                    <DialogContent size="lg" className="max-h-[90vh]">
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    </DialogContent>
                </Dialog>
            ) : null}

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

            {/* Edit Functions Dialog */}
            {foundryId && (
                <EditFunctionsDialog
                    isOpen={showEditFunctions}
                    onClose={() => setShowEditFunctions(false)}
                    currentFunctions={orbitFunctions}
                    foundryId={foundryId}
                />
            )}
        </div>
    )
}
