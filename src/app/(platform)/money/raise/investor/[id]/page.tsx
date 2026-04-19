import { getInvestorDetail } from '@/actions/money-raise'
import { InvestorDetailView } from './investor-detail-view'

export const dynamic = 'force-dynamic'

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getInvestorDetail(id)
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <InvestorDetailView detail={result} />
}
