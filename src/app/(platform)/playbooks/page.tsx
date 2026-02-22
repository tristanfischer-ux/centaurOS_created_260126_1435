import { Suspense } from 'react'
import { PlaybooksPage } from './playbooks-page'
import { Skeleton } from '@/components/ui/skeleton'
import { getBlueprintTemplates } from '@/actions/blueprints'
import { getObjectivePacks, getSavedPackIds } from '@/actions/packs'
import { getFoundryContext } from '@/actions/foundry-context'
import { getUniversalSubsystems } from '@/actions/universal-subsystems'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Playbooks | ForgeOS',
  description:
    'Find pre-built plans and turn them into objectives and tasks for your team.',
}

// INTENT: The Playbooks page only fetches action-oriented data (packs,
// templates, subsystems, team members). Knowledge content (tutorials,
// techniques, Q&A) is fetched by the /learn page instead.

async function PlaybooksData(): Promise<React.ReactElement> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user ? await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single() : { data: null }

  const foundryId = profile?.foundry_id

  const [
    templatesResult,
    packsResult,
    savedPacksResult,
    foundryContext,
    membersResult,
    universalSubsystems,
  ] = await Promise.all([
    getBlueprintTemplates(),
    getObjectivePacks(),
    getSavedPackIds(),
    getFoundryContext(),
    foundryId ? supabase
      .from('profiles')
      .select('id, full_name, role, email, avatar_url')
      .eq('foundry_id', foundryId)
      .neq('role', 'AI_Agent')
      .order('full_name')
      : Promise.resolve({ data: null }),
    getUniversalSubsystems(),
  ])

  if (templatesResult.error) {
    console.error('[Playbooks] Failed to fetch templates:', templatesResult.error)
  }
  if (packsResult.error) {
    console.error('[Playbooks] Failed to fetch packs:', packsResult.error)
  }
  if (savedPacksResult.error) {
    console.error('[Playbooks] Failed to fetch saved packs:', savedPacksResult.error)
  }
  if ('error' in membersResult && membersResult.error) {
    console.error('[Playbooks] Failed to fetch members:', membersResult.error)
  }

  const members = (membersResult.data || []).map(m => ({
    id: m.id,
    full_name: m.full_name || 'Unknown',
    role: m.role,
    email: m.email || '',
    avatar_url: m.avatar_url,
  }))

  return (
    <PlaybooksPage
      templates={templatesResult.data || []}
      packs={packsResult.packs || []}
      initialSavedPackIds={Array.from(savedPacksResult.savedIds || [])}
      foundryContext={foundryContext}
      members={members}
      universalSubsystems={universalSubsystems}
    />
  )
}

export default function PlaybooksRoute(): React.ReactElement {
  return (
    <Suspense fallback={<PlaybooksSkeleton />}>
      <PlaybooksData />
    </Suspense>
  )
}

function PlaybooksSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="space-y-3 pb-4 border-b border-muted">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-96" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
