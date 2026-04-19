/**
 * @file DangerTab.tsx — Plan settings · Danger zone (stub).
 *
 * Hosts destructive-or-escalated Plan admin tools in a later chunk (e.g.
 * bulk-archive killed goals, re-run backfill). V1 ships as a placeholder
 * so the IA is stable.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

export function DangerTab() {
    return (
        <div className="space-y-6 pt-4">
            <Card className="border-status-warning-light">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-4 w-4 text-status-warning-dark" />
                        Danger zone
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        Destructive Plan-admin controls live here. Nothing is wired up in
                        V1 — we&apos;ll add controls one at a time as they become needed,
                        so nothing hazardous ships unintentionally.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
