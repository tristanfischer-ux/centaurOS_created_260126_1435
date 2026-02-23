/**
 * @file page.tsx — Individual project P&L detail page
 *
 * @description Shows a project's full transaction history with
 * revenue/expense breakdown and the ability to add transactions.
 */

import type { Metadata } from 'next'
import { getProjectDetail } from '@/actions/finance-projects'
import { ProjectDetailView } from './project-detail-view'

export const metadata: Metadata = {
  title: 'Project Detail | Finance | ForgeOS',
  description: 'View project P&L and transaction history',
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}): Promise<React.ReactNode> {
  const { projectId } = await params

  const result = await getProjectDetail(projectId).catch(() => ({
    data: null,
    error: 'Failed to load project',
  }))

  if (!result.data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">{result.error ?? 'Project not found'}</p>
      </div>
    )
  }

  return (
    <ProjectDetailView
      project={result.data.project}
      initialTransactions={result.data.transactions}
    />
  )
}
