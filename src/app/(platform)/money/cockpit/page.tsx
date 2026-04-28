import { CockpitView } from './cockpit-view'
import { getCockpitData } from '@/actions/money-cockpit'

export const dynamic = 'force-dynamic'

export default async function CockpitPage() {
  const data = await getCockpitData()
  if ('error' in data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{data.error}</p>
      </div>
    )
  }
  return <CockpitView data={data} />
}
