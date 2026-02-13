'use server'

/**
 * @file me-dashboard.ts — Server action for the personal command centre dashboard.
 *
 * @description Fetches all data needed by the /me dashboard in a single parallel
 * call: greeting data, focus metrics, weekly tasks, objective progress,
 * activity heatmap, and streak information.
 *
 * @dependencies
 * - Supabase: profiles, tasks, objectives, task_history, provider_profiles
 * - Activity: getActivityUnreadCount (for unread updates count)
 * - Foundry context: getFoundryIdCached
 *
 * @security Requires authenticated user. All queries scoped to user + foundry.
 * @audit No audit logging — read-only action.
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getActivityUnreadCount } from './activity'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Dashboard data shape returned by getMyDashboardData.
 * Used by the /me dashboard page to render all sections.
 */
export interface MeDashboardData {
  /** Personalized greeting data */
  greeting: {
    name: string
    role: string
    avatarUrl: string | null
  }
  /** Focus metric cards (top row) */
  focus: {
    tasksDueToday: number
    overdueTasks: number
    unreadUpdates: number
    completedThisWeek: number
  }
  /** Tasks with due dates this week, for the weekly timeline */
  weekTasks: Array<{
    id: string
    title: string
    status: string
    dueDate: string
    priority: string
  }>
  /** Top active objectives with computed task-based progress */
  topObjectives: Array<{
    id: string
    title: string
    progress: number
    dueDate: string | null
    totalTasks: number
    completedTasks: number
  }>
  /** Activity counts by date for the 12-week heatmap */
  activityHeatmap: Array<{ date: string; count: number }>
  /** Consecutive days with activity (going backwards from today) */
  currentStreak: number
  /** Active tasks assigned to user for Priority Queue (up to 30) */
  priorityTasks: Array<{
    id: string
    title: string
    status: string
    end_date: string | null
    task_number: number | null
  }>
  /** Authenticated user ID */
  userId: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns YYYY-MM-DD string for a Date object.
 *
 * @param {Date} date - The date to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Returns the Monday of the week containing the given date.
 *
 * @param {Date} date - Reference date
 * @returns {Date} Monday at 00:00:00
 */
function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// ─── Main Action ────────────────────────────────────────────────────────────

/**
 * Fetches all data for the personal command centre dashboard.
 *
 * @description Performs 10+ parallel Supabase queries to gather:
 * - Profile data for greeting
 * - Task metrics (due today, overdue, completed this week)
 * - Week's tasks for timeline
 * - Top objectives with task-based progress
 * - Activity history for 12-week heatmap
 * - Unread updates count
 *
 * @returns {Promise<MeDashboardData | null>} Dashboard data, or null if unauthenticated
 *
 * @security Requires authenticated user. Tasks/objectives scoped to foundry.
 */
export async function getMyDashboardData(): Promise<MeDashboardData | null> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return null

  // ── Date boundaries ────────────────────────────────────────────────────
  const now = new Date()
  const todayStr = toDateString(now)

  const monday = getMonday(now)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const mondayStr = toDateString(monday)
  const sundayStr = toDateString(sunday)

  // 12 weeks back for heatmap
  const twelveWeeksAgo = new Date(now)
  twelveWeeksAgo.setDate(now.getDate() - 84)
  const twelveWeeksAgoStr = twelveWeeksAgo.toISOString()

  // ── Parallel data fetches ──────────────────────────────────────────────
  const [
    profileResult,
    tasksDueTodayResult,
    overdueTasksResult,
    completedThisWeekResult,
    weekTasksResult,
    objectivesResult,
    tasksForObjectivesResult,
    activityResult,
    unreadResult,
    priorityTasksResult,
  ] = await Promise.all([
    // 1. Profile for greeting
    supabase
      .from('profiles')
      .select('full_name, role, avatar_url')
      .eq('id', user.id)
      .single(),

    // 2. Tasks due today (not completed)
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .neq('status', 'Completed')
      .not('end_date', 'is', null)
      .eq('end_date', todayStr),

    // 3. Overdue tasks (end_date < today, not completed)
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .neq('status', 'Completed')
      .not('end_date', 'is', null)
      .lt('end_date', todayStr),

    // 4. Tasks completed this week
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .eq('status', 'Completed')
      .not('end_date', 'is', null)
      .gte('end_date', mondayStr)
      .lte('end_date', sundayStr),

    // 5. All tasks this week (for timeline)
    supabase
      .from('tasks')
      .select('id, title, status, end_date, risk_level')
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .not('end_date', 'is', null)
      .gte('end_date', mondayStr)
      .lte('end_date', sundayStr)
      .order('end_date', { ascending: true })
      .limit(25),

    // 6. Top active objectives in this foundry
    supabase
      .from('objectives')
      .select('id, title, status, milestone_date, progress')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),

    // 7. All non-ghost tasks with objectives (for progress calculation)
    supabase
      .from('tasks')
      .select('id, status, objective_id')
      .eq('foundry_id', foundryId)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .not('objective_id', 'is', null),

    // 8. Task history for activity heatmap (last 12 weeks)
    supabase
      .from('task_history')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', twelveWeeksAgoStr)
      .order('created_at', { ascending: true }),

    // 9. Unread updates count
    getActivityUnreadCount(),

    // 10. Active tasks assigned to user for Priority Queue
    supabase
      .from('tasks')
      .select('id, title, status, end_date, task_number')
      .eq('foundry_id', foundryId)
      .eq('assignee_id', user.id)
      .eq('is_ghost', false)
      .is('deleted_at', null)
      .neq('status', 'Completed')
      .order('end_date', { ascending: true, nullsFirst: false })
      .limit(30),
  ])

  const profile = profileResult.data
  if (!profile) return null

  // ── Build greeting ─────────────────────────────────────────────────────
  const greeting = {
    name: profile.full_name || 'there',
    role: profile.role || 'Member',
    avatarUrl: profile.avatar_url,
  }

  // ── Build focus metrics ────────────────────────────────────────────────
  const unreadTotal = unreadResult.success && unreadResult.data
    ? unreadResult.data.total
    : 0

  const focus = {
    tasksDueToday: tasksDueTodayResult.count ?? 0,
    overdueTasks: overdueTasksResult.count ?? 0,
    unreadUpdates: unreadTotal,
    completedThisWeek: completedThisWeekResult.count ?? 0,
  }

  // ── Build week tasks ───────────────────────────────────────────────────
  const weekTasks = (weekTasksResult.data ?? []).map((t) => ({
    id: t.id,
    title: t.title || 'Untitled task',
    status: t.status || 'Pending',
    dueDate: t.end_date || todayStr,
    priority: t.risk_level || 'Medium',
  }))

  // ── Build objectives with progress ─────────────────────────────────────
  // Group tasks by objective to compute progress
  const objectiveTaskMap = new Map<string, { total: number; completed: number }>()
  for (const task of tasksForObjectivesResult.data ?? []) {
    if (!task.objective_id) continue
    const entry = objectiveTaskMap.get(task.objective_id) ?? { total: 0, completed: 0 }
    entry.total++
    if (task.status === 'Completed') entry.completed++
    objectiveTaskMap.set(task.objective_id, entry)
  }

  const topObjectives = (objectivesResult.data ?? []).map((obj) => {
    const counts = objectiveTaskMap.get(obj.id) ?? { total: 0, completed: 0 }
    const progress = counts.total > 0
      ? Math.round((counts.completed / counts.total) * 100)
      : (obj.progress ?? 0)
    return {
      id: obj.id,
      title: obj.title || 'Untitled objective',
      progress,
      dueDate: obj.milestone_date ?? null,
      totalTasks: counts.total,
      completedTasks: counts.completed,
    }
  })

  // ── Build activity heatmap ─────────────────────────────────────────────
  // Group activity events by date (YYYY-MM-DD)
  const activityByDate = new Map<string, number>()
  for (const event of activityResult.data ?? []) {
    if (!event.created_at) continue
    const dateStr = event.created_at.split('T')[0]
    activityByDate.set(dateStr, (activityByDate.get(dateStr) ?? 0) + 1)
  }

  const activityHeatmap = Array.from(activityByDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── Calculate current streak ───────────────────────────────────────────
  // Consecutive days with activity, going backwards from today/yesterday
  let currentStreak = 0
  const checkDate = new Date(now)

  // If today has no activity yet, start counting from yesterday
  if (!activityByDate.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  // Walk backwards counting consecutive days
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const dateStr = toDateString(checkDate)
    if (activityByDate.has(dateStr)) {
      currentStreak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  // ── Build priority tasks ───────────────────────────────────────────────
  const priorityTasks = (priorityTasksResult.data ?? []).map((t) => ({
    id: t.id,
    title: t.title || 'Untitled task',
    status: t.status || 'Pending',
    end_date: t.end_date,
    task_number: t.task_number ?? null,
  }))

  return {
    greeting,
    focus,
    weekTasks,
    topObjectives,
    activityHeatmap,
    currentStreak,
    priorityTasks,
    userId: user.id,
  }
}
