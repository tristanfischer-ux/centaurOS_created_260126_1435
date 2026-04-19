import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { listMembersWithOverrides } from '@/actions/money-permissions'
import { PermissionsView } from './permissions-view'

export const dynamic = 'force-dynamic'

export default async function MoneyPermissionsPage() {
  const result = await listMembersWithOverrides()

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
        <h1 className="text-2xl font-bold tracking-tight">Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Members of this foundry plus any per-user capability overrides. Overrides can be time-boxed.
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
        <PermissionsView members={result.members} />
      )}
    </div>
  )
}
