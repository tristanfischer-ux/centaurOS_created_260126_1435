import { Suspense } from 'react'
import { BlueprintsView } from './blueprints-view'
import { getBlueprints, getBlueprintTemplates } from '@/actions/blueprints'
import { getAdvisoryQuestions } from '@/actions/advisory'
import { getObjectivePacks } from '@/actions/packs'
import { getUniversalSubsystems } from '@/actions/universal-subsystems'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Inspiration | CentaurOS',
  description: 'Get ideas on what to do next. Discover opportunities, find experts, and turn insights into action.',
}

async function BlueprintsData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch user profile for role info
  const { data: profile } = user ? await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() : { data: null }

  const [blueprintsResult, templatesResult, questionsResult, packsResult, universalSubsystems] = await Promise.all([
    getBlueprints(),
    getBlueprintTemplates(),
    getAdvisoryQuestions({ limit: 10 }),
    getObjectivePacks(),
    getUniversalSubsystems(),
  ])

  // Transform questions to match the expected Question interface
  const transformedQuestions = (questionsResult.data || []).map(q => ({
    id: q.id,
    title: q.title,
    body: q.body,
    category: q.category || 'General',
    visibility: q.visibility === 'network' ? 'public' as const : 'foundry' as const,
    created_at: q.created_at,
    asker: {
      id: q.author?.id || q.asked_by || '',
      full_name: q.author?.full_name || 'Unknown User',
      avatar_url: undefined,
    },
    ai_answer: undefined, // Would need to fetch from answers
    verification_status: (q.status === 'verified' ? 'verified' : q.status === 'answered' ? 'endorsed' : 'unverified') as 'unverified' | 'endorsed' | 'verified',
    upvotes: 0, // Would need to fetch from votes
    answers_count: q.answer_count || 0,
    views: q.view_count,
  }))

  return (
    <BlueprintsView
      blueprints={blueprintsResult.data || []}
      templates={templatesResult.data || []}
      questions={transformedQuestions}
      packs={packsResult.packs || []}
      universalSubsystems={universalSubsystems}
      currentUserId={user?.id || ''}
      currentUserRole={profile?.role || undefined}
    />
  )
}

function BlueprintsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Cards skeleton */}
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
