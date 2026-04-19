import { getForecastPnl } from '@/actions/money-plan'
import { PnlView } from './pnl-view'

export const dynamic = 'force-dynamic'

export default async function PnlPage() {
  const result = await getForecastPnl(12, 'month')
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <PnlView report={result.report} />
}
