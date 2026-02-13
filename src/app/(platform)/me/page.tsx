/**
 * @file page.tsx — "Me" personal command centre dashboard
 *
 * @description Server component that fetches personalized dashboard data
 * and renders the user's command centre with focus metrics, weekly tasks,
 * objective progress, activity heatmap, and quick actions.
 *
 * @security Requires authenticated user. Redirects to /login if not authenticated.
 *
 * @related
 * - Server action: src/actions/me-dashboard.ts
 * - View component: src/app/(platform)/me/me-dashboard-view.tsx
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyDashboardData } from '@/actions/me-dashboard'
import { MeDashboardView } from './me-dashboard-view'

export const metadata: Metadata = {
  title: 'Me | ForgeOS',
  description: 'Your personal command centre — focus, progress, and activity',
}

export default async function MePage(): Promise<React.ReactNode> {
  // AUTH: Verify user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getMyDashboardData()
  if (!data) redirect('/login')

  return <MeDashboardView data={data} />
}
