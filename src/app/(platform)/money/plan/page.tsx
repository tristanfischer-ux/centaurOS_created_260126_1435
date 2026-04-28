import { getPlanData } from '@/actions/money-plan'
import { PlanView } from './plan-view'

export const dynamic = 'force-dynamic'

export default async function PlanPage() {
  const data = await getPlanData()
  if ('error' in data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{data.error}</p>
      </div>
    )
  }
  return <PlanView data={data} />
}
