import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TeamPageView } from './team-page-view'
import { isPast } from 'date-fns'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshButton } from '@/components/RefreshButton'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BusinessFunction, FunctionId } from './types'

/**
 * Team page — server component that authenticates, fetches foundry data,
 * and renders the dual-view Team page with real data.
 *
 * @description Fetches profiles, tasks, teams, and objectives from Supabase.
 * Computes member metrics, insights, and passes everything to TeamPageView.
 *
 * @security Requires authenticated user with foundry membership.
 */
export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // AUTH: Verify user has a foundry
    const { data: currentUserProfile, error: profileError } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    if (profileError) {
        console.error('[TeamPage] Failed to fetch user profile:', { error: profileError.message, userId: user.id })
    }

    const foundry_id = currentUserProfile?.foundry_id || user.app_metadata?.foundry_id

    if (!foundry_id) {
        return (
            <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-status-warning-light mx-auto">
                    <AlertTriangle className="h-7 w-7 text-status-warning" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-xl font-bold text-foreground">Profile Setup Incomplete</h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Your account profile hasn&apos;t been fully set up yet.
                        Please complete the onboarding process or contact support if this persists.
                    </p>
                </div>
                <div className="flex gap-3 justify-center">
                    <Button asChild>
                        <Link href="/today">Go to Dashboard</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/settings">Settings</Link>
                    </Button>
                </div>
            </div>
        )
    }

    // Fetch all tasks with extended fields
    const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, assignee_id, status, title, end_date, start_date, created_at, objective_id, progress, risk_level')
        .eq('foundry_id', foundry_id)
        .eq('is_ghost', false)
        .is('deleted_at', null)

    if (tasksError) {
        console.error('[TeamPage] Failed to fetch tasks:', { error: tasksError.message, foundryId: foundry_id })
    }

    // Fetch objectives for name labels
    const { data: objectives, error: objectivesError } = await supabase
        .from('objectives')
        .select('id, title')
        .eq('foundry_id', foundry_id)
        .eq('is_ghost', false)
        .is('deleted_at', null)

    if (objectivesError) {
        console.error('[TeamPage] Failed to fetch objectives:', { error: objectivesError.message, foundryId: foundry_id })
    }

    const objectiveMap: Record<string, string> = {}
    for (const obj of objectives || []) {
        objectiveMap[obj.id] = obj.title
    }

    // Fetch all profiles for the current foundry (include primary_function for orbit view)
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
            id,
            full_name,
            role,
            avatar_url,
            paired_ai_id,
            bio,
            primary_function_id,
            paired_ai:profiles!paired_ai_id(id, full_name, role, avatar_url)
        `)
        .eq('foundry_id', foundry_id)
        .order('role', { ascending: true })

    if (profilesError) {
        console.error('[TeamPage] Failed to fetch profiles:', { error: profilesError.message, foundryId: foundry_id })
    }

    // Fetch business functions catalog (for orbit function categories)
    const { data: businessFunctions, error: businessFunctionsError } = await supabase
        .from('business_functions')
        .select('id, category, name, display_order')

    if (businessFunctionsError) {
        console.error('[TeamPage] Failed to fetch business functions:', { error: businessFunctionsError.message })
    }

    // Fetch custom function definitions for this foundry (if any)
    const { data: customFunctions, error: customFunctionsError } = await supabase
        .from('foundry_business_functions')
        .select('function_id, label, short, display_order')
        .eq('foundry_id', foundry_id)
        .order('display_order')

    if (customFunctionsError) {
        console.error('[TeamPage] Failed to fetch custom functions:', { error: customFunctionsError.message, foundryId: foundry_id })
    }

    // Build functions array: use custom if exists, otherwise use defaults
    const DEFAULT_FUNCTIONS: BusinessFunction[] = [
        { id: 'sales' as FunctionId, label: 'Sales', short: 'SALES' },
        { id: 'marketing' as FunctionId, label: 'Marketing', short: 'MKTG' },
        { id: 'finance' as FunctionId, label: 'Finance', short: 'FIN' },
        { id: 'hr' as FunctionId, label: 'People & HR', short: 'HR' },
        { id: 'legal' as FunctionId, label: 'Legal & Admin', short: 'LEGAL' },
        { id: 'operations' as FunctionId, label: 'Operations', short: 'OPS' },
        { id: 'product' as FunctionId, label: 'Product', short: 'PROD' },
    ]

    const orbitFunctions: BusinessFunction[] = customFunctions && customFunctions.length === 7
        ? customFunctions.map(cf => ({
            id: cf.function_id as FunctionId,
            label: cf.label,
            short: cf.short,
        }))
        : DEFAULT_FUNCTIONS

    // Fetch foundry function coverage (for orbit status per function)
    const { data: rawCoverageData, error: coverageError } = await supabase
        .from('foundry_function_coverage')
        .select('id, function_id, coverage_status, covered_by')
        .eq('foundry_id', foundry_id)

    if (coverageError) {
        console.error('[TeamPage] Failed to fetch function coverage:', { error: coverageError.message, foundryId: foundry_id })
    }

    // Enrich coverage rows with function category info via lookup
    interface CoverageRow {
        id: string
        function_id: string
        coverage_status: string
        covered_by: string | null
        function: { id: string; category: string; name: string } | null
    }
    const bfMap = new Map((businessFunctions ?? []).map(bf => [bf.id, bf]))
    const rawCoverage: CoverageRow[] = (rawCoverageData ?? []).map(c => {
        const bf = bfMap.get(c.function_id)
        return {
            ...c,
            function: bf ? { id: bf.id, category: bf.category, name: bf.name } : null,
        }
    })

    // Fetch marketplace People listings (for orbit outer ring + card view)
    const { data: marketplacePeople, error: marketplaceError } = await supabase
        .from('marketplace_listings')
        .select('id, title, subcategory, description, attributes')
        .eq('category', 'People')
        .eq('is_verified', true)

    if (marketplaceError) {
        console.error('[TeamPage] Failed to fetch marketplace listings:', { error: marketplaceError.message })
    }

    // Fetch teams with members
    interface TeamMemberJoin {
        profile: {
            id: string
            full_name: string | null
            role: string | null
        } | null
    }

    const { data: rawTeams, error: rawTeamsError } = await supabase
        .from('teams')
        .select(`
            id,
            name,
            foundry_id,
            is_auto_generated,
            created_at,
            team_members(
                profile:profiles(id, full_name, role)
            )
        `)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    if (rawTeamsError) {
        console.error('[TeamPage] Failed to fetch teams:', { error: rawTeamsError.message, foundryId: foundry_id })
    }

    // Surface user-facing error when critical queries fail
    const criticalErrors = [tasksError, objectivesError, profilesError, rawTeamsError].filter(Boolean)
    if (criticalErrors.length > 0) {
        const firstError = criticalErrors[0] as { message: string }
        return (
            <div className="p-8 space-y-4">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Failed to load team data</AlertTitle>
                    <AlertDescription>
                        {firstError.message} Please try again.
                    </AlertDescription>
                </Alert>
                <RefreshButton showLabel />
            </div>
        )
    }

    const teams = rawTeams?.map(team => ({
        ...team,
        members: (team.team_members as TeamMemberJoin[] | null)?.map(tm => tm.profile).filter((profile): profile is NonNullable<typeof profile> => profile !== null) || []
    })) || []

    // ─── Build Extended Tasks ─────────────────

    // Build extended tasks with objective names
    // Safe: Supabase enum/nullable fields are cast to plain strings for the client
    const extendedTasks = (tasks || []).map(t => ({
        id: t.id,
        title: t.title,
        status: (t.status || 'Pending') as string,
        assignee_id: t.assignee_id,
        end_date: t.end_date,
        start_date: t.start_date,
        created_at: t.created_at || new Date().toISOString(),
        objective_id: t.objective_id || null,
        objective_title: t.objective_id ? (objectiveMap[t.objective_id] || null) : null,
        progress: t.progress,
        risk_level: (t.risk_level || null) as string | null,
    }))

    // ─── Unassigned Tasks ────────────────────────

    const unassignedTasks = extendedTasks.filter(t =>
        !t.assignee_id &&
        t.status !== 'Completed' &&
        t.status !== 'Rejected'
    )

    // ─── Member Metrics ──────────────────────────

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

    interface MemberMetrics {
        id: string
        full_name: string
        role: "Founder" | "Executive" | "Apprentice" | "AI_Agent"
        avatar_url: string | null
        paired_ai_id: string | null
        bio: string | null
        primary_function_id: string | null
        pairedAI: { id: string, full_name: string | null, role: string, avatar_url: string | null }[]
        activeTasks: number
        completedTasks: number
        pendingTasks: number
        rejectedTasks: number
        taskTitles: {
            active: string[]
            completed: string[]
            pending: string[]
            rejected: string[]
        }
        taskDetails: {
            active: TaskDetail[]
            pending: TaskDetail[]
        }
    }

    const membersWithMetrics: MemberMetrics[] = (profiles || [])?.map((profile) => {
        const memberTasks = extendedTasks.filter(t => t.assignee_id === profile.id)
        const activeTasks = memberTasks.filter(t => t.status === 'Accepted')
        const pendingTasks = memberTasks.filter(t => t.status === 'Pending')

        return {
            id: profile.id,
            full_name: profile.full_name || 'Unknown',
            role: profile.role || 'Apprentice',
            avatar_url: profile.avatar_url || null,
            paired_ai_id: profile.paired_ai_id,
            bio: profile.bio,
            primary_function_id: profile.primary_function_id ?? null,
            pairedAI: profile.paired_ai ? [{
                id: profile.paired_ai.id,
                full_name: profile.paired_ai.full_name,
                role: profile.paired_ai.role,
                avatar_url: profile.paired_ai.avatar_url
            }] : [],
            activeTasks: activeTasks.length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: pendingTasks.length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
            taskTitles: {
                active: activeTasks.map(t => t.title),
                completed: memberTasks.filter(t => t.status === 'Completed').map(t => t.title),
                pending: pendingTasks.map(t => t.title),
                rejected: memberTasks.filter(t => t.status === 'Rejected').map(t => t.title),
            },
            taskDetails: {
                active: activeTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    end_date: t.end_date,
                    start_date: t.start_date,
                    created_at: t.created_at,
                    objective_id: t.objective_id,
                    objective_title: t.objective_title,
                    progress: t.progress,
                    risk_level: t.risk_level,
                    status: t.status,
                })),
                pending: pendingTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    end_date: t.end_date,
                    start_date: t.start_date,
                    created_at: t.created_at,
                    objective_id: t.objective_id,
                    objective_title: t.objective_title,
                    progress: t.progress,
                    risk_level: t.risk_level,
                    status: t.status,
                }))
            }
        }
    }) || []

    // ─── Compute Insights ────────────────────────

    const allHumanMembers = membersWithMetrics.filter(m => m.role !== 'AI_Agent')

    const overloadedMembers = allHumanMembers.filter(m => {
        const score = Math.min(100, (m.activeTasks * 20) + (m.pendingTasks * 10))
        return score > 70
    })

    const idleMembers = allHumanMembers.filter(m => m.activeTasks === 0 && m.pendingTasks === 0)

    const overdueTasks = extendedTasks.filter(t => {
        if (!t.end_date) return false
        if (t.status === 'Completed' || t.status === 'Rejected') return false
        return isPast(new Date(t.end_date))
    })

    const insights = {
        overloadedMembers: overloadedMembers.map(m => ({ id: m.id, name: m.full_name })),
        idleMembers: idleMembers.map(m => ({ id: m.id, name: m.full_name })),
        overdueTaskCount: overdueTasks.length,
        unassignedTaskCount: unassignedTasks.length,
        totalActiveTasks: extendedTasks.filter(t => t.status === 'Accepted').length,
        totalPendingTasks: extendedTasks.filter(t => t.status === 'Pending').length,
    }

    // ─── Render ──────────────────────────────────

    const founders = membersWithMetrics.filter(p => p.role === 'Founder')
    const executives = membersWithMetrics.filter(p => p.role === 'Executive')
    const apprentices = membersWithMetrics.filter(p => p.role === 'Apprentice')

    // Build a lookup from business_function id → category
    const functionCategoryMap: Record<string, string> = {}
    for (const bf of businessFunctions || []) {
        functionCategoryMap[bf.id] = bf.category
    }

    // Summarise foundry coverage by orbit function category
    // Each entry: { category, statuses } where statuses is an array of coverage_status values
    interface CoverageSummary {
        category: string
        hasPartialOrCovered: boolean
    }
    const coverageByCategoryMap: Record<string, CoverageSummary> = {}
    for (const c of rawCoverage || []) {
        const fn = c.function as { id: string; category: string; name: string } | null
        if (!fn) continue
        const cat = fn.category
        if (!coverageByCategoryMap[cat]) {
            coverageByCategoryMap[cat] = { category: cat, hasPartialOrCovered: false }
        }
        if (c.coverage_status === 'covered' || c.coverage_status === 'partial') {
            coverageByCategoryMap[cat].hasPartialOrCovered = true
        }
    }

    return (
        <TeamPageView
            founders={founders}
            executives={executives}
            apprentices={apprentices}
            teams={teams}
            currentUserId={user.id}
            insights={insights}
            unassignedTasks={unassignedTasks}
            allTasks={extendedTasks}
            marketplacePeople={(marketplacePeople || []).map(mp => ({
                id: mp.id,
                title: mp.title,
                subcategory: mp.subcategory,
                description: mp.description,
                attributes: mp.attributes as Record<string, unknown> || {},
            }))}
            functionCategoryMap={functionCategoryMap}
            orbitFunctions={orbitFunctions}
            foundryId={foundry_id}
        />
    )
}
