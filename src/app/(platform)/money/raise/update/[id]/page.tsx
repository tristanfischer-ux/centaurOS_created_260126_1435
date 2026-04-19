import { getInvestorUpdate } from '@/actions/money-updates'
import { UpdateDetailView } from './update-detail-view'

export const dynamic = 'force-dynamic'

export default async function UpdateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getInvestorUpdate(id)
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <UpdateDetailView update={result.update} recipients={result.recipients} />
}
