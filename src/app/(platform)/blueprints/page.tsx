import { Suspense } from 'react'
import { BlueprintsView } from './blueprints-view'
import { getBlueprints, getBlueprintTemplates } from '@/actions/blueprints'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Product Maps | ForgeOS',
  description: 'Visualise every domain, skill, and component your product needs. Find gaps and turn them into action.',
}

async function BlueprintsData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user ? await supabase
    .from('profiles')
    .select('role, foundry_id')
    .eq('id', user.id)
    .single() : { data: null }

  const foundryId = profile?.foundry_id

  const [blueprintsResult, templatesResult, membersResult] = await Promise.all([
    getBlueprints(),
    getBlueprintTemplates(),
    foundryId ? supabase
      .from('profiles')
      .select('id, full_name, role, email, avatar_url')
      .eq('foundry_id', foundryId)
      .neq('role', 'AI_Agent')
      .order('full_name')
      : Promise.resolve({ data: null }),
  ])

  const members = (membersResult.data || []).map(m => ({
    id: m.id,
    full_name: m.full_name || 'Unknown',
    role: m.role,
    email: m.email || '',
    avatar_url: m.avatar_url,
  }))

  return (
    <BlueprintsView
      blueprints={blueprintsResult.data || []}
      templates={templatesResult.data || []}
      members={members}
    />
  )
}

function BlueprintsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function BlueprintsPage() {
  return (
    <Suspense fallback={<BlueprintsSkeleton />}>
      <BlueprintsData />
    </Suspense>
  )
}
