import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { scoreInvestorsAgainstThesis } from '@/actions/money-raise'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { ForYouView } from './for-you-view'

export const dynamic = 'force-dynamic'

export default async function ForYouPage() {
  const result = await scoreInvestorsAgainstThesis({ limit: 50 })

  if ('error' in result) {
    if (result.error === 'no_active_thesis') {
      return (
        <div className="mx-auto max-w-2xl py-12">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center px-4 text-center">
                <div className="mb-4 text-muted-foreground opacity-50">
                  <Sparkles className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-display font-medium text-foreground mb-2">
                  Build a thesis first to unlock matched investors
                </h3>
                <p className="text-sm text-muted-foreground mb-2 max-w-md">
                  Matched investors rank the Fractional Forge directory against your
                  active thesis — stage, sector, geography, cheque size, activity and
                  data freshness — so you see the 50 best fits first.
                </p>
                <p className="text-sm text-muted-foreground mb-6 max-w-md">
                  Or paste your business plan and we&rsquo;ll extract one automatically.
                </p>
                <Link href="/money/raise/thesis">
                  <Button>Build thesis</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-destructive">{result.error}</p>
            <Link href="/money/raise/browse">
              <Button variant="secondary" size="sm">Go to browse</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Resolve already-in-pipeline listing IDs so the client can render
  // "Added" instead of an "Add to pipeline" CTA. We do this here (server)
  // so no extra round-trip hits the client and the bundle stays cold.
  const alreadyInPipelineIds = await loadAlreadyInPipelineIds(
    result.scored.map((s) => s.listing.id),
  )

  return (
    <ForYouView
      scored={result.scored}
      thesisId={result.thesis_id}
      alreadyInPipelineIds={alreadyInPipelineIds}
    />
  )
}

/**
 * Fetch marketplace_listing_ids the active foundry already has in pipeline.
 * Safe to run server-side — RLS + the session already scope to the caller's
 * foundry. Returns [] on any error (UI treats that as "none in pipeline",
 * which is the correct fail-open behaviour here — the user can still click
 * "Add" and the server action is idempotent).
 */
async function loadAlreadyInPipelineIds(listingIds: string[]): Promise<string[]> {
  if (listingIds.length === 0) return []
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('investor_pipeline_state')
      .select('marketplace_listing_id')
      .in('marketplace_listing_id', listingIds)
      .is('archived_at', null)
    if (error || !data) return []
    return data
      .map((r) => r.marketplace_listing_id)
      .filter((id): id is string => !!id)
  } catch {
    return []
  }
}
