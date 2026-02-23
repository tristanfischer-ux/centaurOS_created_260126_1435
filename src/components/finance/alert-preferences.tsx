/**
 * @file alert-preferences.tsx — Settings UI for financial alert thresholds
 *
 * @description Allows users to configure which financial alerts they receive,
 * set threshold values, and choose digest frequency.
 */

'use client'

import { useState, useEffect, useTransition } from 'react'
import { Bell, BellOff, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getAlertPreferences,
  updateAlertPreferences,
  type FinanceAlertPreferences,
  type AlertType,
  type DigestFrequency,
} from '@/actions/finance-alerts'

const ALERT_LABELS: Record<AlertType, { label: string; description: string }> = {
  payment_received: { label: 'Payment received', description: 'When a payment comes in from an order or retainer' },
  invoice_overdue: { label: 'Invoice overdue', description: 'When an invoice passes its due date' },
  payout_completed: { label: 'Payout completed', description: 'When your payout is processed successfully' },
  payout_failed: { label: 'Payout failed', description: 'When a payout attempt fails' },
  budget_threshold: { label: 'Budget threshold', description: 'When spending reaches your configured percentage of a budget' },
  cash_low: { label: 'Low cash balance', description: 'When your wallet balance drops below your threshold' },
  retainer_payment_due: { label: 'Retainer payment due', description: 'When a retainer payment is coming due' },
}

const DIGEST_OPTIONS: Array<{ value: DigestFrequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'none', label: 'Off' },
]

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

interface AlertPreferencesProps {
  className?: string
}

export function AlertPreferences({ className }: AlertPreferencesProps) {
  const [prefs, setPrefs] = useState<FinanceAlertPreferences | null>(null)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAlertPreferences().then(result => {
      if (result.data) setPrefs(result.data)
      if (result.error) setError(result.error)
    })
  }, [])

  const handleToggleAlert = (alertType: AlertType, enabled: boolean) => {
    if (!prefs) return
    setPrefs({
      ...prefs,
      alertTypes: { ...prefs.alertTypes, [alertType]: enabled },
    })
  }

  const handleSave = () => {
    if (!prefs) return
    setSaved(false)
    setError(null)

    startTransition(async () => {
      const result = await updateAlertPreferences({
        alertTypes: prefs.alertTypes,
        cashLowThreshold: prefs.cashLowThreshold,
        budgetThresholdPct: prefs.budgetThresholdPct,
        digestFrequency: prefs.digestFrequency,
        digestDay: prefs.digestDay,
      })

      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  if (!prefs) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      {/* Alert Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-international-orange" />
            Alert Types
          </CardTitle>
          <CardDescription>Choose which financial events trigger notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(ALERT_LABELS) as AlertType[]).map((type) => (
            <div key={type} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{ALERT_LABELS[type].label}</Label>
                <p className="text-xs text-muted-foreground">{ALERT_LABELS[type].description}</p>
              </div>
              <Switch
                checked={prefs.alertTypes[type] ?? false}
                onCheckedChange={(checked) => handleToggleAlert(type, checked)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Thresholds</CardTitle>
          <CardDescription>Set custom trigger points for alerts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cash-threshold">Low cash threshold (pounds)</Label>
            <Input
              id="cash-threshold"
              type="number"
              placeholder="e.g. 500"
              value={prefs.cashLowThreshold ? prefs.cashLowThreshold / 100 : ''}
              onChange={(e) => {
                const val = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null
                setPrefs({ ...prefs, cashLowThreshold: val })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Get alerted when your wallet balance drops below this amount.
              Leave empty to disable.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget-threshold">Budget alert at (%)</Label>
            <Input
              id="budget-threshold"
              type="number"
              min={1}
              max={100}
              value={prefs.budgetThresholdPct}
              onChange={(e) => {
                const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 80))
                setPrefs({ ...prefs, budgetThresholdPct: val })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Get alerted when a budget reaches this percentage of its limit.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Digest */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Financial Digest</CardTitle>
          <CardDescription>Receive a summary of your financial activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={prefs.digestFrequency}
              onValueChange={(val) => setPrefs({ ...prefs, digestFrequency: val as DigestFrequency })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIGEST_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {prefs.digestFrequency === 'weekly' && (
            <div className="space-y-2">
              <Label>Send on</Label>
              <Select
                value={String(prefs.digestDay)}
                onValueChange={(val) => setPrefs({ ...prefs, digestDay: parseInt(val) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="bg-international-orange hover:bg-international-orange/90"
        >
          <Save className="h-4 w-4 mr-2" />
          {isPending ? 'Saving...' : 'Save Preferences'}
        </Button>
        {saved && (
          <p className="text-sm text-status-success">Preferences saved.</p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
