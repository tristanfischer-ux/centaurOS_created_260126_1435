import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { getMoneyAuditLog, encodeMoneyAuditCursor } from '@/actions/money-audit'
import { AuditLogView } from './audit-log-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ cursor?: string }>
}

export default async function MoneyAuditLogPage({ searchParams }: PageProps) {
  const params = await searchParams
  const result = await getMoneyAuditLog({ cursor: params.cursor ?? null, limit: 50 })

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
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every Money-section mutation, newest first. Founder-only. Export the full log as CSV.
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
        <AuditLogView
          rows={result.rows}
          nextCursor={result.nextCursor ? await encodeMoneyAuditCursor(result.nextCursor) : null}
          hasPrevious={!!params.cursor}
        />
      )}
    </div>
  )
}
