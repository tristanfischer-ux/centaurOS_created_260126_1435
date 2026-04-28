import { getPitchOverview } from '@/actions/money-pitch'
import { PitchOverviewView } from './pitch-overview-view'

export const dynamic = 'force-dynamic'

export default async function PitchPage() {
  const result = await getPitchOverview()
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <PitchOverviewView overview={result} />
}
