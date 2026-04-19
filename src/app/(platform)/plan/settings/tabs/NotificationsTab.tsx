/**
 * @file NotificationsTab.tsx — Plan settings · Notifications tab (stub).
 *
 * V1 ships as an explanatory placeholder; the real per-channel controls
 * land alongside the Notifications migration in a follow-up chunk.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function NotificationsTab() {
    return (
        <div className="space-y-6 pt-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Notifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        Per-channel notification controls land here in the next Plan
                        update. For now, Plan uses your global notification preferences in
                        Account settings.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
