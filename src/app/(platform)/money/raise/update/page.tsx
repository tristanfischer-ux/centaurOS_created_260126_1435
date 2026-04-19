import { listInvestorUpdates } from '@/actions/money-updates'
import { UpdateListView } from './update-list-view'

export const dynamic = 'force-dynamic'

export default async function UpdateListPage() {
  const result = await listInvestorUpdates()
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <UpdateListView updates={result.updates} />
}
