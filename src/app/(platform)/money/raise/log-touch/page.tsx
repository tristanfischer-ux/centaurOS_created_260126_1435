import { listInvestorsForPicker } from '@/actions/money-raise'
import { LogTouchView } from './log-touch-view'

export const dynamic = 'force-dynamic'

export default async function LogTouchPage() {
  const result = await listInvestorsForPicker()
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <LogTouchView investors={result.investors} />
}
