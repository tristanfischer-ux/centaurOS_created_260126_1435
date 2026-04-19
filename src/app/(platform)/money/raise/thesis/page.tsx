import { getActiveThesis } from '@/actions/money-thesis'
import { ThesisView } from './thesis-view'

export const dynamic = 'force-dynamic'

export default async function ThesisPage() {
  const result = await getActiveThesis()
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        <p className="text-sm">{result.error}</p>
      </div>
    )
  }
  return <ThesisView thesis={result.thesis} versions={result.versions} />
}
