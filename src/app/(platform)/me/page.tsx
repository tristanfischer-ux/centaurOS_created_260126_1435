/**
 * @file page.tsx — "Me" section intro + personal command centre dashboard
 *
 * @description Server component that fetches personalized dashboard data
 * and renders the Me section intro page (hero, value props, feature cards)
 * followed by the dashboard widgets (focus metrics, weekly tasks,
 * objective progress, activity heatmap, and quick actions).
 *
 * Follows the same pattern as Plan, Workshop, and Marketplace section pages.
 *
 * @security Requires authenticated user. Redirects to /login if not authenticated.
 *
 * @related
 * - Server action: src/actions/me-dashboard.ts
 * - View component: src/app/(platform)/me/me-section-intro.tsx
 * - Dashboard body: src/app/(platform)/me/me-dashboard-view.tsx
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyDashboardData } from '@/actions/me-dashboard'
import { MeSectionIntro } from './me-section-intro'

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

  return <MeSectionIntro data={data} />
}
