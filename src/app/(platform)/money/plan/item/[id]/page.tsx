import { getPlanLine } from '@/actions/money-plan'
import { PlanLineView } from './plan-line-view'

export const dynamic = 'force-dynamic'

export default async function PlanLineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getPlanLine(id)
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <PlanLineView line={result.line} />
}
