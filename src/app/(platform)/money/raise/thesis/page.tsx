import Link from 'next/link'
import { getActiveThesis } from '@/actions/money-thesis'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ThesisView } from './thesis-view'

export const dynamic = 'force-dynamic'

export default async function ThesisPage() {
  const result = await getActiveThesis()
  if ('error' in result) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              We couldn&rsquo;t load your thesis: {result.error}
            </p>
            <Link href="/money/raise/thesis">
              <Button variant="secondary" size="sm">Try again</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }
  return <ThesisView thesis={result.thesis} versions={result.versions} />
}
