import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { ObjectivesBoard } from './objectives-board'
import { getBlueprintTemplates } from '@/actions/blueprints'
import { getObjectivePacks, getSavedPackIds, getUsedPackIds } from '@/actions/packs'
import { getFoundryContext } from '@/actions/foundry-context'
import { getUniversalSubsystems } from '@/actions/universal-subsystems'

export const metadata: Metadata = {
  title: 'Objectives',
  description: 'Set and track company objectives aligned with your strategic pillars',
  openGraph: {
    title: 'Objectives | ForgeOS',
    description: 'Set and track company objectives aligned with your strategic pillars',
    type: 'website',
  },
}

export const revalidate = 30

export default async function NewObjectivesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, foundry_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return <ProfileSetupRequired userRole={profile?.role} />
  }

  // Fetch all objectives (strategic + regular) in one query
  // Note: is_private may not be in generated types but exists in DB via migration
  // product_id joins to products for the "Linked to Product X" reverse-link chip.
  const { data: rawObjectives, error } = await supabase
    .from('objectives')
    .select('id, title, description, extended_description, status, progress, parent_objective_id, is_strategic_goal, is_demo, creator_id, foundry_id, created_at, updated_at, start_date, end_date, metadata, product_id, product:products(id, name)')
    .eq('foundry_id', profile.foundry_id)
    .eq('is_ghost', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const allObjectives = (rawObjectives || []) as Array<{
    id: string; title: string; description: string | null; extended_description: string | null;
    status: string | null; progress: number | null; parent_objective_id: string | null;
    is_strategic_goal: boolean | null;
    creator_id: string; foundry_id: string; created_at: string; updated_at: string;
    start_date: string | null; end_date: string | null;
    is_private?: boolean; is_demo?: boolean;
    metadata?: Record<string, unknown> | null;
    product_id?: string | null;
    /** Supabase joins return an array for many-to-many but single row for FK. We coerce below. */
    product?: { id: string; name: string } | { id: string; name: string }[] | null;
  }>

  // Separate strategic objectives (high-level pillars) from regular objectives
  const strategicObjectives = allObjectives
    .filter(o => o.is_strategic_goal === true)
    .map(o => ({ id: o.id, title: o.title, created_at: o.created_at }))

  // Regular objectives exclude strategic goals
  const objectives = allObjectives.filter(o => !o.is_strategic_goal)

  if (error) {
    console.error('Error loading objectives:', error)
    return (
      <div className="p-8">
        <h1 className="font-bold mb-2 text-destructive">Error loading objectives</h1>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    )
  }

  // Type definitions for task joins
  interface TaskAssignee {
    id: string
    full_name: string | null
    role: string | null
  }

  // Fetch tasks for all objectives with assignee info
  const { data: rawTasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      task_number,
      status,
      assignee_id,
      start_date,
      end_date,
      risk_level,
      progress,
      objective_id,
      foundry_id,
      creator_id,
      created_at,
      is_demo,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, role),
      task_assignees(profile:profiles(id, full_name, role))
    `)
    .eq('foundry_id', profile.foundry_id)
    .eq('is_ghost', false)
    .is('deleted_at', null)
    .not('objective_id', 'is', null)
    .order('end_date', { ascending: true })

  // Cast to expected shape (is_private may be in DB but not in generated types)
  const tasks = (rawTasks || []) as Array<{
    id: string; title: string; description: string | null; task_number: number | null;
    status: string; assignee_id: string | null; start_date: string | null; end_date: string | null;
    risk_level: string | null; progress: number | null; objective_id: string | null;
    foundry_id: string; creator_id: string; created_at: string; is_private?: boolean; is_demo?: boolean;
    assignee: TaskAssignee | TaskAssignee[] | null;
    task_assignees: Array<{ profile: TaskAssignee | null }> | null;
  }>

  // INTENT: Fetch members, teams, AND playbooks data in parallel. The playbooks
  // section appears below objectives as "Other ideas for you to be getting on with",
  // mirroring the Team page pattern (your stuff + marketplace).
  const [
    { data: membersData },
    { data: teamsData },
    templatesResult,
    packsResult,
    savedPacksResult,
    usedPacksResult,
    foundryContext,
    universalSubsystems,
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, email, avatar_url').eq('foundry_id', profile.foundry_id),
    supabase.from('teams').select('id, name').eq('foundry_id', profile.foundry_id),
    getBlueprintTemplates(),
    getObjectivePacks(),
    getSavedPackIds(),
    getUsedPackIds(),
    getFoundryContext(),
    getUniversalSubsystems(),
  ])

  const members = (membersData || []).map(p => ({
    id: p.id,
    full_name: p.full_name || 'Unknown',
    role: p.role,
    email: p.email || '',
    avatar_url: p.avatar_url,
  }))
  const teams = teamsData || []

  // Playbooks data for the "Ideas" section
  const playbooksData = {
    templates: templatesResult.data || [],
    packs: packsResult.packs || [],
    initialSavedPackIds: Array.from(savedPacksResult.savedIds || []),
    usedPackIds: Array.from(usedPacksResult.usedIds || []),
    foundryContext,
    universalSubsystems,
  }

  // Build strategy lookup: parent_objective_id -> { id, title }
  const strategyLookup = new Map<string, { id: string; title: string }>()
  for (const so of strategicObjectives) {
    strategyLookup.set(so.id, { id: so.id, title: so.title })
  }

  // Group tasks by objective and calculate health
  const objectivesWithTasks = (objectives || []).map(obj => {
    const objTasks = (tasks || [])
      .filter(t => t.objective_id === obj.id)
      .map(t => ({
        ...t,
        assignee: (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee) as TaskAssignee | null,
        assignees: (t.task_assignees?.map((ta: { profile: TaskAssignee | null }) => ta.profile).filter(Boolean) || []) as TaskAssignee[],
      }))

    const totalTasks = objTasks.length
    const completedTasks = objTasks.filter(t => t.status === 'Completed').length
    const overdueTasks = objTasks.filter(t => {
      if (!t.end_date || t.status === 'Completed') return false
      return new Date(t.end_date) < new Date()
    }).length
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    // Calculate health: on-track, at-risk, off-track, completed
    // GOTCHA: "Not Started" must come before overdue checks — freshly imported
    // objectives with past dates are NOT overdue if nobody has started working yet.
    const activeTasks = objTasks.filter(t => t.status !== 'Pending').length
    let health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
    if (progress === 100) {
      health = 'completed'
    } else if (totalTasks === 0 || activeTasks === 0) {
      health = 'not-started'
    } else if (overdueTasks > 0 || progress < 25) {
      health = 'off-track'
    } else if (overdueTasks === 0 && progress >= 60) {
      health = 'on-track'
    } else {
      health = 'at-risk'
    }

    // Resolve strategic parent for cascade breadcrumbs
    const strategy = obj.parent_objective_id
      ? strategyLookup.get(obj.parent_objective_id) ?? null
      : null

    // Supabase returns joined 1:1 FKs as an array in some versions — coerce to
    // the single-object shape ObjectiveWithTasks expects.
    const productJoin = Array.isArray(obj.product)
      ? (obj.product[0] ?? null)
      : (obj.product ?? null)

    return {
      ...obj,
      tasks: objTasks,
      totalTasks,
      completedTasks,
      overdueTasks,
      progress,
      health,
      strategy,
      product: productJoin,
    }
  })

  // Fetch objectives for dialog
  const objectivesForDialog = (objectives || []).map(o => ({ id: o.id, title: o.title }))

  return (
    <ObjectivesBoard
      objectives={objectivesWithTasks}
      strategicObjectives={strategicObjectives}
      objectivesForDialog={objectivesForDialog}
      members={members}
      teams={teams}
      currentUserId={user.id}
      currentUserRole={profile.role}
      playbooksData={playbooksData}
    />
  )
}
