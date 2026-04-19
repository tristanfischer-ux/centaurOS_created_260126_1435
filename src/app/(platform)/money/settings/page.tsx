import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Coins, ScrollText, ShieldCheck, Settings as SettingsIcon } from 'lucide-react'
import { getMoneySettings } from '@/actions/money-settings'
import { MoneySettingsView } from './settings-view'

export const dynamic = 'force-dynamic'

export default async function MoneySettingsPage() {
  const result = await getMoneySettings()

  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <p className="text-sm text-muted-foreground">{result.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Money settings</h1>
        <p className="text-sm text-muted-foreground">
          Defaults and thresholds for runway, variance alerts, audit retention, and your specialist model tier.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/money/settings/permissions" className="block">
          <Card className="h-full hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-international-orange/10 text-international-orange">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Permissions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <CardDescription>Members + capability overrides</CardDescription>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/money/settings/audit-log" className="block">
          <Card className="h-full hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground">
                  <ScrollText className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Audit log</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <CardDescription>Money-section events with CSV export</CardDescription>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/money/settings/credits" className="block">
          <Card className="h-full hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-success/10 text-success">
                  <Coins className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Credits</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <CardDescription>Specialist usage + budget caps</CardDescription>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <MoneySettingsView settings={result.settings} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Account-wide settings</CardTitle>
          </div>
          <CardDescription>
            Profile, billing, integrations, and notifications live in your top-level account settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings">
            <Button variant="secondary" size="sm">
              Open account settings
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
