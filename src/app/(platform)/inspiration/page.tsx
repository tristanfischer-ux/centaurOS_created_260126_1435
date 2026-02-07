import { Suspense } from 'react'
import { InspirationPageNew } from './inspiration-page-new'
import { Skeleton } from '@/components/ui/skeleton'
import { getBlueprintTemplates } from '@/actions/blueprints'
import { getObjectivePacks, getSavedPackIds } from '@/actions/packs'
import { getFoundryContext } from '@/actions/foundry-context'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Inspiration | ForgeOS',
  description:
    'Discover what to do next. Turn ideas into objectives and tasks for your team.',
}

async function InspirationData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user profile for foundry info
  const { data: profile } = user ? await supabase
    .from('profiles')
    .select('foundry_id')
    .eq('id', user.id)
    .single() : { data: null }

  const foundryId = profile?.foundry_id

  const [templatesResult, packsResult, savedPacksResult, foundryContext, membersResult] = await Promise.all([
    getBlueprintTemplates(),
    getObjectivePacks(),
    getSavedPackIds(),
    getFoundryContext(),
    // Fetch team members for task assignment in UsePackDialog
    foundryId ? supabase
      .from('profiles')
      .select('id, full_name, role, email, avatar_url')
      .eq('foundry_id', foundryId)
      .neq('role', 'AI_Agent')
      .order('full_name')
      : Promise.resolve({ data: null }),
  ])

  // Transform members for use in dialogs
  const members = (membersResult.data || []).map(m => ({
    id: m.id,
    full_name: m.full_name || 'Unknown',
    role: m.role,
    email: m.email || '',
    avatar_url: m.avatar_url,
  }))

  return (
    <InspirationPageNew
      templates={templatesResult.data || []}
      packs={packsResult.packs || []}
      initialSavedPackIds={Array.from(savedPacksResult.savedIds || [])}
      foundryContext={foundryContext}
      members={members}
    />
  )
}

export default function InspirationPage() {
  return (
    <Suspense fallback={<InspirationSkeleton />}>
      <InspirationData />
    </Suspense>
  )
}

function InspirationSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-muted">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
