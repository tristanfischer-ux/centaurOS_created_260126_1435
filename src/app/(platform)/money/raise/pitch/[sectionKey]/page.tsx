import { getPitchSectionByKey } from '@/actions/money-pitch'
import { PitchSectionView } from './pitch-section-view'

export const dynamic = 'force-dynamic'

export default async function PitchSectionPage({
  params,
}: {
  params: Promise<{ sectionKey: string }>
}) {
  const { sectionKey } = await params
  const result = await getPitchSectionByKey(sectionKey)
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <PitchSectionView section={result.section} />
}
