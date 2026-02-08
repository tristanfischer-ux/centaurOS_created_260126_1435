import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ObjectivesBoard } from './objectives-board'
import type { FoundryPurposeData } from '@/types/foundry'

export const dynamic = 'force-dynamic'

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

  if (!profile) {
    redirect('/login')
  }

  // Fetch foundry with purpose_data via RPC (bypasses RLS issue on foundries table)
  const { data: foundry } = await supabase.rpc('ensure_foundry_exists', {
    p_foundry_id: profile.foundry_id,
  })

  // Fetch objectives
  // Note: is_private may not be in generated types but exists in DB via migration
  const { data: rawObjectives, error } = await supabase
    .from('objectives')
    .select('id, title, description, extended_description, status, progress, parent_objective_id, creator_id, foundry_id, created_at, updated_at, is_strategic_goal, milestone_date')
    .eq('foundry_id', profile.foundry_id)
    .order('created_at', { ascending: false })

  const objectives = (rawObjectives || []) as Array<{
    id: string; title: string; description: string | null; extended_description: string | null;
    status: string | null; progress: number | null; parent_objective_id: string | null;
    creator_id: string; foundry_id: string; created_at: string; updated_at: string;
    is_private?: boolean; is_strategic_goal?: boolean; milestone_date?: string | null;
  }>

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
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, role),
      task_assignees(profile:profiles(id, full_name, role))
    `)
    .eq('foundry_id', profile.foundry_id)
    .not('objective_id', 'is', null)
    .order('end_date', { ascending: true })

  // Cast to expected shape (is_private may be in DB but not in generated types)
  const tasks = (rawTasks || []) as Array<{
    id: string; title: string; description: string | null; task_number: number | null;
    status: string; assignee_id: string | null; start_date: string | null; end_date: string | null;
    risk_level: string | null; progress: number | null; objective_id: string | null;
    foundry_id: string; creator_id: string; created_at: string; is_private?: boolean;
    assignee: TaskAssignee | TaskAssignee[] | null;
    task_assignees: Array<{ profile: TaskAssignee | null }> | null;
  }>

  // Fetch members for dialog/assignee display
  const [{ data: membersData }, { data: teamsData }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, email').eq('foundry_id', profile.foundry_id),
    supabase.from('teams').select('id, name').eq('foundry_id', profile.foundry_id),
  ])

  const members = (membersData || []).map(p => ({
    id: p.id,
    full_name: p.full_name || 'Unknown',
    role: p.role,
    email: p.email || '',
  }))
  const teams = teamsData || []

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
    let health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
    if (progress === 100) {
      health = 'completed'
    } else if (totalTasks === 0) {
      health = 'not-started'
    } else if (overdueTasks > 0 || progress < 25) {
      health = 'off-track'
    } else if (overdueTasks === 0 && progress >= 60) {
      health = 'on-track'
    } else {
      health = 'at-risk'
    }

    return {
      ...obj,
      tasks: objTasks,
      totalTasks,
      completedTasks,
      overdueTasks,
      progress,
      health,
    }
  })

  // Fetch objectives for dialog
  const objectivesForDialog = (objectives || []).map(o => ({ id: o.id, title: o.title }))

  return (
    <ObjectivesBoard
      objectives={objectivesWithTasks}
      objectivesForDialog={objectivesForDialog}
      members={members}
      teams={teams}
      currentUserId={user.id}
      currentUserRole={profile.role}
      purposeData={(foundry as { purpose_data?: FoundryPurposeData | null } | null)?.purpose_data ?? null}
      isFounder={profile.role === 'Founder'}
      foundryId={profile.foundry_id}
    />
  )
}
