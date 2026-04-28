/**
 * @file GeneralTab.tsx — Plan settings · General tab.
 *
 * V1 surface: nudge frequency + specialist behaviour. Both are currently
 * read-only display stubs — the underlying preferences table wire-up is
 * tracked as a follow-up. Shipping this as a visible shell keeps the 4-tab
 * IA coherent from day one.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GeneralTab() {
    return (
        <div className="space-y-6 pt-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Nudge frequency</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        Plan nudges you about goal drift, overdue tasks, and Friday wrap-ups.
                        You&apos;ll be able to pick a cadence here soon.
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-xs">
                        <li>Standard — one digest per morning, Friday close reminder</li>
                        <li>Quiet — only critical (at-risk goals, broken assumptions)</li>
                        <li>Off — nothing pushed; Plan still logs everything to History</li>
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Specialist behaviour</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        Specialists can surface recommendations, run pressure-tests, and
                        pre-draft reports. Choose how active they should be on Plan.
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-xs">
                        <li>On — recommendations appear in Today + the goal sidebar</li>
                        <li>Quiet — recommendations only appear when you open a goal</li>
                        <li>Off — specialists still answer when asked, but never push</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    )
}
