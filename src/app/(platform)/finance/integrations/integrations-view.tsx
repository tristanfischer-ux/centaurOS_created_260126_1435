/**
 * @file integrations-view.tsx — Client component for accounting integrations
 *
 * @description Shows provider cards (Xero, QuickBooks, FreeAgent) with
 * connection status and sync history.
 */

'use client'

import { useState, useTransition } from 'react'
import { Link2, Unlink, RefreshCw, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  initializeIntegration,
  disconnectIntegration,
  type AccountingIntegration,
  type IntegrationProvider,
  type IntegrationStatus,
} from '@/actions/finance-integrations'

const PROVIDERS: Array<{
  value: IntegrationProvider
  label: string
  description: string
  logoText: string
}> = [
  {
    value: 'xero',
    label: 'Xero',
    description: 'Cloud accounting for small businesses. Invoicing, bank reconciliation, and financial reports.',
    logoText: 'X',
  },
  {
    value: 'quickbooks',
    label: 'QuickBooks',
    description: 'Accounting software for managing income, expenses, and payroll.',
    logoText: 'QB',
  },
  {
    value: 'freeagent',
    label: 'FreeAgent',
    description: 'UK-focused accounting software for freelancers and small businesses.',
    logoText: 'FA',
  },
]

const STATUS_VARIANTS: Record<IntegrationStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  connected: 'success',
  syncing: 'warning',
  error: 'destructive',
  disconnected: 'secondary',
}

interface IntegrationsViewProps {
  initialData: AccountingIntegration[]
}

export function IntegrationsView({ initialData }: IntegrationsViewProps) {
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  const integrationsByProvider = new Map(data.map(d => [d.provider, d]))

  const handleConnect = (provider: IntegrationProvider) => {
    startTransition(async () => {
      const result = await initializeIntegration(provider)
      if (result.data) {
        setData(prev => {
          const existing = prev.find(p => p.provider === provider)
          if (existing) {
            return prev.map(p => p.provider === provider ? result.data! : p)
          }
          return [...prev, result.data!]
        })
        // INTENT: In production, this would redirect to the provider's OAuth page.
        // For now, the integration record is created in 'disconnected' state.
      }
    })
  }

  const handleDisconnect = (integrationId: string) => {
    startTransition(async () => {
      const result = await disconnectIntegration(integrationId)
      if (!result.error) {
        setData(prev => prev.map(d => d.id === integrationId ? { ...d, status: 'disconnected' as const } : d))
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <Link2 className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">Connect your accounting software for two-way sync</p>
        </div>
      </div>

      {/* Coming Soon Notice */}
      <Card className="border-international-orange/20 bg-international-orange/5">
        <CardContent className="py-4">
          <p className="text-sm text-foreground">
            Accounting integrations are coming soon. Connect your Xero, QuickBooks, or FreeAgent account to automatically sync invoices, expenses, and financial data.
          </p>
        </CardContent>
      </Card>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROVIDERS.map((provider) => {
          const integration = integrationsByProvider.get(provider.value)
          const isConnected = integration?.status === 'connected'

          return (
            <Card key={provider.value} className="relative">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <span className="text-sm font-bold text-foreground">{provider.logoText}</span>
                  </div>
                  <div>
                    <CardTitle className="text-base">{provider.label}</CardTitle>
                    {integration && (
                      <Badge variant={STATUS_VARIANTS[integration.status]} className="mt-1">
                        {integration.status}
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="mt-2">{provider.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {integration?.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(integration.lastSyncAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}

                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        className="flex-1"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Sync Now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(integration!.id)}
                        disabled={isPending}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => handleConnect(provider.value)}
                      disabled={isPending}
                      className="w-full bg-international-orange hover:bg-international-orange/90"
                      size="sm"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Connect {provider.label}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* What gets synced */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">What gets synced?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Push to Accounting</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Invoices and payment links</li>
                <li>Expenses and receipts</li>
                <li>Project transactions</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Pull from Accounting</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Chart of accounts</li>
                <li>Bank transactions</li>
                <li>Tax rates and codes</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Automatic</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Daily sync at 2am UTC</li>
                <li>Real-time on invoice creation</li>
                <li>Conflict resolution logging</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
