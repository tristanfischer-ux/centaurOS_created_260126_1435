/**
 * @file page.tsx — Server component for the /time page.
 *
 * Fetches current week's time entries, tasks, and projects for the logged-in user,
 * then delegates to the TimeTrackerView client component.
 *
 * @related
 * - src/app/(platform)/time/time-tracker-view.tsx — Client component
 * - src/actions/time-tracking.ts — Server actions
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { redirect } from 'next/navigation'
import { TimeTrackerView } from './time-tracker-view'
import { toTimeEntryWithRelations, TIME_ENTRY_SELECT } from '@/lib/time-tracking-utils'

export const metadata = {
  title: 'Time',
  description: 'Track hours across your projects and tasks',
}

/** Get the Monday (UTC) of the current week. */
function getCurrentMondayUTC(): string {
  const d = new Date()
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = utcDate.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  utcDate.setUTCDate(utcDate.getUTCDate() + diff)
  return utcDate.toISOString().split('T')[0]
}

export default async function TimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/investors')

  const weekStart = getCurrentMondayUTC()
  const weekEnd = (() => {
    const d = new Date(weekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().split('T')[0]
  })()

  // Fetch time entries, tasks, and projects in parallel
  const [entriesResult, tasksResult, projectsResult] = await Promise.all([
    supabase
      .from('time_entries')
      .select(TIME_ENTRY_SELECT)
      .eq('foundry_id', foundryId)
      .eq('user_id', user.id)
      .gte('entry_date', weekStart)
      .lte('entry_date', weekEnd)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true }),

    supabase
      .from('tasks')
      .select('id, title')
      .eq('foundry_id', foundryId)
      .is('deleted_at', null)
      .in('status', ['Pending', 'Accepted'])
      .order('title', { ascending: true })
      .limit(200),

    supabase
      .from('finance_projects')
      .select('id, name')
      .eq('foundry_id', foundryId)
      .eq('status', 'active')
      .order('name', { ascending: true })
      .limit(100),
  ])

  // M-7 fix: Use shared mapper instead of duplicating snake→camel logic
  const entries = (entriesResult.data ?? []).map((row) =>
    toTimeEntryWithRelations(row as unknown as Record<string, unknown>)
  )

  const tasks = (tasksResult.data ?? []).map((t) => ({ id: t.id, title: t.title }))
  const projects = (projectsResult.data ?? []).map((p) => ({ id: p.id, name: p.name }))

  return (
    <TimeTrackerView
      initialWeekStart={weekStart}
      initialEntries={entries}
      tasks={tasks}
      projects={projects}
    />
  )
}
