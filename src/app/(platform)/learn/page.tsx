import { Suspense } from 'react'
import { LearnPage } from './learn-page'
import { Skeleton } from '@/components/ui/skeleton'
import { getAdvisoryQuestions } from '@/actions/advisory'
import { getTutorials, type TutorialListItem } from '@/actions/tutorials'
import { getAllTechniqueEnrichments } from '@/actions/manufacturing-techniques'
import type { TechniqueEnrichment } from '@/types/manufacturing-techniques'

export const metadata = {
  title: 'Inspiration',
  description:
    'Build knowledge with manufacturing techniques, tutorials, and expert Q&A.',
}

// INTENT: The Learn page fetches knowledge/reference content only. Action
// content (packs, projects, subsystems) is on /playbooks.

async function LearnData(): Promise<React.ReactElement> {
  const [tutorialsResult, questionsResult, enrichments] = await Promise.all([
    getTutorials({ pageSize: 50 }),
    getAdvisoryQuestions({ limit: 50 }),
    getAllTechniqueEnrichments(),
  ])

  const tutorials: TutorialListItem[] = 'data' in tutorialsResult ? tutorialsResult.data : []

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
    ai_answer: undefined,
    verification_status: (q.status === 'verified' ? 'verified' : q.status === 'answered' ? 'endorsed' : 'unverified') as 'unverified' | 'endorsed' | 'verified',
    upvotes: 0,
    answers_count: q.answer_count || 0,
    views: q.view_count,
  }))

  return (
    <LearnPage
      tutorials={tutorials}
      questions={transformedQuestions}
      enrichments={enrichments}
    />
  )
}

export default function LearnRoute(): React.ReactElement {
  return (
    <Suspense fallback={<LearnSkeleton />}>
      <LearnData />
    </Suspense>
  )
}

function LearnSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="space-y-3 pb-4 border-b border-muted">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-80" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-36 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
