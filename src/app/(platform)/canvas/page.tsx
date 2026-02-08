import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CanvasView } from './canvas-view'
import { WhiteboardList } from './components/whiteboard-list'
import { CanvasTabs } from './components/canvas-tabs'
import type { CanvasObjective, CanvasTask } from './types'
import type { TaskAssignee } from '@/app/(platform)/new-objectives/types'
import type { WhiteboardRow } from '@/actions/whiteboards'

export const dynamic = 'force-dynamic'

/**
 * @description Canvas page with two layers:
 * 1. Spatial Data Canvas - objectives and tasks as interactive ReactFlow nodes
 * 2. Whiteboards - Excalidraw freeform brainstorming boards
 *
 * @security Authenticates user and scopes all queries to their foundry.
 */
export default async function CanvasPage() {
  // AUTH: Verify user session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // AUTH: Resolve foundry context
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, foundry_id')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    redirect('/login')
  }

  const foundryId = profile.foundry_id

  // Fetch objectives, tasks, and whiteboards in parallel
  const [objectivesResult, tasksResult, whiteboardsResult] = await Promise.all([
    supabase
      .from('objectives')
      .select('id, title, description, status, progress, parent_objective_id, created_at')
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select(`
        id,
        title,
        status,
        assignee_id,
        objective_id,
        end_date,
        risk_level,
        progress,
        task_number,
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, role)
      `)
      .eq('foundry_id', foundryId)
      .order('end_date', { ascending: true }),
    supabase
      .from('whiteboards')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false }),
  ])

  if (objectivesResult.error) {
    console.error('[Canvas] Error loading objectives:', objectivesResult.error)
  }
  if (tasksResult.error) {
    console.error('[Canvas] Error loading tasks:', tasksResult.error)
  }
  if (whiteboardsResult.error) {
    console.error('[Canvas] Error loading whiteboards:', whiteboardsResult.error)
  }

  const rawObjectives = objectivesResult.data || []
  const rawTasks = (tasksResult.data || []) as Array<{
    id: string
    title: string
    status: string
    assignee_id: string | null
    objective_id: string | null
    end_date: string | null
    risk_level: string | null
    progress: number | null
    task_number: number | null
    assignee: TaskAssignee | TaskAssignee[] | null
  }>
  const whiteboards = (whiteboardsResult.data || []) as WhiteboardRow[]

  // Calculate health for each objective
  const tasksByObjective = new Map<string, typeof rawTasks>()
  for (const task of rawTasks) {
    if (!task.objective_id) continue
    const existing = tasksByObjective.get(task.objective_id) || []
    existing.push(task)
    tasksByObjective.set(task.objective_id, existing)
  }

  const objectives: CanvasObjective[] = rawObjectives.map(obj => {
    const objTasks = tasksByObjective.get(obj.id) || []
    const totalTasks = objTasks.length
    const completedTasks = objTasks.filter(t => t.status === 'Completed').length
    const overdueTasks = objTasks.filter(t => {
      if (!t.end_date || t.status === 'Completed') return false
      return new Date(t.end_date) < new Date()
    }).length
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : (obj.progress ?? 0)

    let health: CanvasObjective['health']
    if (progress === 100 && totalTasks > 0) {
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
      id: obj.id,
      title: obj.title,
      description: obj.description,
      status: obj.status,
      progress,
      parent_objective_id: obj.parent_objective_id,
      health,
      totalTasks,
      completedTasks,
      overdueTasks,
      created_at: obj.created_at ?? '',
    }
  })

  // Normalize task assignees
  const tasks: CanvasTask[] = rawTasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    assignee_id: t.assignee_id,
    assignee: (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee) as TaskAssignee | null,
    objective_id: t.objective_id,
    end_date: t.end_date,
    risk_level: t.risk_level,
    progress: t.progress,
    task_number: t.task_number,
  }))

  // Objective list for whiteboard linking
  const objectivesForDialog = rawObjectives.map(o => ({ id: o.id, title: o.title }))

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 -mb-32 lg:-mb-8">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-slate-100 bg-white">
        <div className="h-8 w-1 bg-international-orange rounded-full" />
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Canvas</h1>
          <p className="text-sm text-muted-foreground">
            Visual map of your work and freeform whiteboards
          </p>
        </div>
      </div>

      {/* Tab-based view switcher */}
      <CanvasTabs
        spatialCanvas={<CanvasView objectives={objectives} tasks={tasks} />}
        whiteboardList={
          <WhiteboardList
            whiteboards={whiteboards}
            objectives={objectivesForDialog}
          />
        }
      />
    </div>
  )
}
