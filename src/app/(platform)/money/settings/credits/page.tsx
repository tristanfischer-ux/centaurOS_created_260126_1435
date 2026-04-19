import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { getCreditsSummary } from '@/actions/money-credits'
import { CreditsView } from './credits-view'

export const dynamic = 'force-dynamic'

export default async function MoneyCreditsPage() {
  const result = await getCreditsSummary()

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/money/settings"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3 mr-1" />
          Money settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
        <p className="text-sm text-muted-foreground">
          Specialist usage and budget caps for the current period. Founder-only — cost is confidential.
        </p>
      </header>

      {'error' in result ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{result.error}</p>
            <Link href="/money/settings">
              <Button variant="secondary" size="sm">Back to settings</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <CreditsView summary={result.summary} />
      )}
    </div>
  )
}
