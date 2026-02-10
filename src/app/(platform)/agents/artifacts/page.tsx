import { Suspense } from 'react'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { typography } from '@/lib/design-system'
import { getArtifacts } from '@/actions/agent-artifacts'
import { ArtifactsView } from './artifacts-view'
import { Skeleton } from '@/components/ui/skeleton'

import type { AgentArtifactRow } from '@/actions/agent-artifacts'

/**
 * Loading fallback for the artifacts list.
 */
function ArtifactsSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

export const revalidate = 60

/**
 * Artifacts listing page.
 *
 * @description Server component that fetches all artifacts for the
 * authenticated user's foundry and passes them to the interactive
 * ArtifactsView client component.
 *
 * @security Requires authentication; redirects to /login if not signed in.
 * RLS on agent_artifacts enforces foundry isolation server-side.
 */
export default async function ArtifactsPage(): Promise<React.JSX.Element> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: artifacts, error } = await getArtifacts()

  if (error) {
    console.error('[ArtifactsPage] Failed to load artifacts:', { error })
  }

  const safeArtifacts: AgentArtifactRow[] = artifacts ?? []

  return (
    <div>
      {/* Page header with orange accent bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Artifacts</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Outputs from your agent workflows
          </p>
        </div>
      </div>

      {/* Interactive listing */}
      <ArtifactsView artifacts={safeArtifacts} />
    </div>
  )
}
