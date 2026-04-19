import { getRaiseData } from '@/actions/money-raise'
import { RaiseView } from './raise-view'

export const dynamic = 'force-dynamic'

export default async function RaisePage() {
  const data = await getRaiseData()
  if ('error' in data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{data.error}</p>
      </div>
    )
  }
  return <RaiseView data={data} />
}
