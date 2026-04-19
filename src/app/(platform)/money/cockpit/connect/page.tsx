import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getXeroConnection } from '@/actions/money-xero'

export const dynamic = 'force-dynamic'

export default async function ConnectXeroPage() {
  const state = await getXeroConnection()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Connect Xero</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Pull live actuals into Cockpit and Plan. One Xero organisation per foundry.
        </p>
      </header>

      {'error' in state ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{state.error}</CardContent>
        </Card>
      ) : state.connected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Connected to {state.organisation_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={state.sync_state === 'healthy' ? 'success' : state.sync_state === 'error' ? 'destructive' : 'secondary'}>
                {state.sync_state ?? 'unknown'}
              </Badge>
              {state.last_sync_at && (
                <span className="text-xs text-muted-foreground">
                  Last sync {new Date(state.last_sync_at).toLocaleString('en-GB')}
                </span>
              )}
            </div>
            {state.last_error_message && (
              <p className="text-xs text-destructive">{state.last_error_message}</p>
            )}
            <div className="flex gap-2">
              <Link href="/money/cockpit">
                <Button variant="secondary">Back to Cockpit</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xero is not connected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You can work without Xero — plans work manually — but connecting pulls
              actuals + enables variance tracking against your forecast.
            </p>
            <div className="flex gap-2">
              <Button disabled>Connect Xero (coming soon)</Button>
              <Link href="/money/plan">
                <Button variant="secondary">Start plan manually</Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              OAuth wiring ships in a follow-up chunk. In the meantime, plan + cockpit work with manual numbers.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
