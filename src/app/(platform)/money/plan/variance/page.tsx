import { getVarianceReport } from '@/actions/money-plan'
import { VarianceView } from './variance-view'

export const dynamic = 'force-dynamic'

export default async function VariancePage() {
  const result = await getVarianceReport(6, 'month')
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <VarianceView data={result} />
}
