import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { typography } from '@/lib/design-system'
import { getArtifacts } from '@/actions/agent-artifacts'
import { ArtifactsView } from './artifacts-view'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshButton } from '@/components/RefreshButton'
import { AlertCircle } from 'lucide-react'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'

import type { AgentArtifactRow } from '@/actions/agent-artifacts'

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
    <div className="space-y-6">
      {/* Page header with orange accent bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Outputs</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Documents, reports, and emails your specialists have produced from brainstorming sessions
          </p>
        </div>
      </div>

      <SpecialistBriefingHero
        specialistId="chief-of-staff"
        specialistName="Cal"
        specialistTitle="Chief of Staff"
        narrative={null}
        fallbackMessage="Every deliverable your specialists have produced is here — pitch decks, financial models, strategy briefs, CAD exports. Need to send something for tomorrow's meeting? Find it by specialist or type, grab the latest version, and export. Nothing gets lost in a chat thread."
        isLoading={false}
        severity="success"
        context={{ type: 'general', title: 'Deliverables', description: 'Cal on deliverables.', metadata: {} }}
        storageKey="deliverables"
      />

      {error && (
        <div className="mt-6 space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load deliverables</AlertTitle>
            <AlertDescription>
              {typeof error === 'string' ? error : 'Unable to load artifacts. Please try again.'}
            </AlertDescription>
          </Alert>
          <RefreshButton showLabel />
        </div>
      )}

      {/* Interactive listing */}
      <ArtifactsView artifacts={safeArtifacts} />
    </div>
  )
}
