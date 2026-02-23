/**
 * @file page.tsx — Project-level P&L tracking page
 *
 * @description Lists all finance projects with revenue, expenses,
 * and margin summaries. Allows creating new projects.
 */

import type { Metadata } from 'next'
import { getProjectsWithPnL } from '@/actions/finance-projects'
import { ProjectsView } from './projects-view'

export const metadata: Metadata = {
  title: 'Projects | Finance | ForgeOS',
  description: 'Track per-project profitability and P&L',
}

export default async function ProjectsPage(): Promise<React.ReactNode> {
  const result = await getProjectsWithPnL().catch(() => ({
    data: null,
    error: 'Failed to load projects',
  }))

  return <ProjectsView initialData={result.data ?? []} />
}
