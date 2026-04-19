import { getScenarioDetail } from '@/actions/money-scenarios'
import { ScenarioDetailView } from './scenario-detail-view'

export const dynamic = 'force-dynamic'

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getScenarioDetail(id)
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <ScenarioDetailView scenario={result} />
}
