import { FinanceDashboardSkeleton } from '@/components/finance/finance-skeleton'

export default function FinanceLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <FinanceDashboardSkeleton />
    </div>
  )
}
