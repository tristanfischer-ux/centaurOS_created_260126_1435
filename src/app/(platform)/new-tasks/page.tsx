import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TasksCommandCenter } from './tasks-command-center'

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
      <div className="p-8">
        <h1 className="font-bold mb-2 text-destructive">Error: No Foundry</h1>
        <p className="text-muted-foreground">
          No foundry associated with your account. Please contact support.
        </p>
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

  // Fetch message counts
  const tasksWithMessageCounts = await Promise.all(
    (tasks || []).map(async (task) => {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', task.id)

      return {
        ...task,
        message_count: count || 0,
      }
    })
  )

  // Fetch related data
  const [{ data: objectives }, { data: membersData }, { data: teamsData }] = await Promise.all([
    supabase.from('objectives').select('id, title').eq('foundry_id', foundry_id),
    supabase.from('profiles').select('id, full_name, role, email').eq('foundry_id', foundry_id),
    supabase.from('teams').select('id, name').eq('foundry_id', foundry_id),
  ])

  const objectivesList = objectives || []
  const members = (membersData || []).map(p => ({
    id: p.id,
    full_name: p.full_name || 'Unknown',
    role: p.role,
    email: p.email || '',
  }))
  const teams = teamsData || []

  // Join tasks with related data and cast to expected shape
  const tasksWithData = tasksWithMessageCounts.map(task => ({
    ...task,
    assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
    creator: Array.isArray(task.creator) ? task.creator[0] : task.creator,
    objective: Array.isArray(task.objective) ? task.objective[0] : task.objective,
    assignees: task.task_assignees?.map((ta: { profile: unknown }) => ta.profile).filter(Boolean) || [],
    task_files: task.task_files || [],
  })) as unknown as import('./types').TaskWithData[]

  return (
    <TasksCommandCenter
      tasks={tasksWithData}
      objectives={objectivesList}
      members={members}
      teams={teams}
      currentUserId={user.id}
      currentUserRole={userProfile?.role}
      initialTaskId={taskId}
    />
  )
}
