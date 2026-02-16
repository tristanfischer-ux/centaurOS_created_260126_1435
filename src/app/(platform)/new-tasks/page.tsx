import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TasksCommandCenter } from './tasks-command-center'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const revalidate = 60

interface NewTasksPageProps {
  searchParams: Promise<{ taskId?: string }>
}

export default async function NewTasksPage({ searchParams }: NewTasksPageProps) {
  const params = await searchParams
  const taskId = params.taskId

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('foundry_id, role')
    .eq('id', user.id)
    .single()

  const foundry_id = userProfile?.foundry_id

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

  // Fetch tasks with related data
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:profiles!assignee_id(id, full_name, role),
      creator:profiles!creator_id(id, full_name, role),
      objective:objectives!objective_id(id, title),
      task_files(id, file_name, file_size, created_at),
      task_assignees(profile:profiles(id, full_name, role))
    `)
    .eq('foundry_id', foundry_id)
    .eq('is_ghost', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading tasks:', error)
    return (
      <div className="p-8">
        <h1 className="font-bold mb-2 text-destructive">Error loading tasks</h1>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    )
  }

  // Fetch message counts in a single aggregate query instead of N+1
  const taskIds = (tasks || []).map((t) => t.id)
  const { data: messageCounts } = taskIds.length > 0
    ? await supabase
        .from('messages')
        .select('task_id')
        .in('task_id', taskIds)
    : { data: [] as { task_id: string }[] }

  // Build a lookup map: task_id -> count
  const messageCountMap = new Map<string, number>()
  for (const row of messageCounts || []) {
    if (row.task_id) {
      messageCountMap.set(row.task_id, (messageCountMap.get(row.task_id) || 0) + 1)
    }
  }

  const tasksWithMessageCounts = (tasks || []).map((task) => ({
    ...task,
    message_count: messageCountMap.get(task.id) || 0,
  }))

  // Fetch related data (objectives include parent_objective_id for strategic context)
  const [{ data: objectives }, { data: membersData }, { data: teamsData }, { data: strategicGoals }] = await Promise.all([
    supabase.from('objectives').select('id, title, parent_objective_id').eq('foundry_id', foundry_id).eq('is_ghost', false).is('deleted_at', null),
    supabase.from('profiles').select('id, full_name, role, email').eq('foundry_id', foundry_id),
    supabase.from('teams').select('id, name').eq('foundry_id', foundry_id),
    supabase.from('objectives').select('id, title').eq('foundry_id', foundry_id).eq('is_strategic_goal', true).is('deleted_at', null),
  ])

  const objectivesList = objectives || []
  const members = (membersData || []).map(p => ({
    id: p.id,
    full_name: p.full_name || 'Unknown',
    role: p.role,
    email: p.email || '',
  }))
  const teams = teamsData || []

  // Build strategic context lookup: objective_id -> { strategy id, title }
  const strategicGoalMap = new Map<string, { id: string; title: string }>()
  for (const sg of strategicGoals || []) {
    strategicGoalMap.set(sg.id, { id: sg.id, title: sg.title })
  }
  const objectiveToStrategy = new Map<string, { id: string; title: string }>()
  for (const obj of objectivesList) {
    const parentId = (obj as { parent_objective_id?: string | null }).parent_objective_id
    if (parentId && strategicGoalMap.has(parentId)) {
      objectiveToStrategy.set(obj.id, strategicGoalMap.get(parentId)!)
    }
  }

  // Join tasks with related data and cast to expected shape
  const tasksWithData = tasksWithMessageCounts.map(task => {
    const objectiveData = Array.isArray(task.objective) ? task.objective[0] : task.objective
    const strategyData = objectiveData?.id ? objectiveToStrategy.get(objectiveData.id) ?? null : null
    return {
      ...task,
      assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
      creator: Array.isArray(task.creator) ? task.creator[0] : task.creator,
      objective: objectiveData,
      strategy: strategyData,
      assignees: task.task_assignees?.map((ta: { profile: unknown }) => ta.profile).filter(Boolean) || [],
      task_files: task.task_files || [],
    }
  }) as unknown as import('./types').TaskWithData[]

  const strategicObjectivesList = (strategicGoals || []).map(sg => ({ id: sg.id, title: sg.title }))

  return (
    <TasksCommandCenter
      tasks={tasksWithData}
      objectives={objectivesList}
      strategicObjectives={strategicObjectivesList}
      members={members}
      teams={teams}
      currentUserId={user.id}
      currentUserRole={userProfile?.role}
      initialTaskId={taskId}
    />
  )
}
