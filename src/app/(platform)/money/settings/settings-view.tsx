'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Circle, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateMoneySettings,
  markOnboardingStep,
  type MoneySettings,
  type SpecialistModelTier,
  type OnboardingProgress,
  type OnboardingStep,
} from '@/actions/money-settings'

const FISCAL_MONTHS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April (UK default)' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const ONBOARDING_LABELS: Record<OnboardingStep, { title: string; helper: string }> = {
  connect_accounting: {
    title: 'Connect accounting (Xero)',
    helper: 'Pull live actuals so runway tracks reality, not just the plan.',
  },
  first_plan_line: {
    title: 'Add your first plan line',
    helper: 'A single salary or rent line is enough to start projecting runway.',
  },
  define_thesis: {
    title: 'Define your investor thesis',
    helper: 'Lets the directory rank investors against your stage, sector, and cheque size.',
  },
  create_round: {
    title: 'Create your fundraise round',
    helper: 'Sets the target, instrument, and close date the pipeline tracks against.',
  },
  log_first_touch: {
    title: 'Log your first investor touch',
    helper: 'Anything counts — a meeting, a cold reply, a portfolio intro.',
  },
  send_first_update: {
    title: 'Send your first investor update',
    helper: 'Existing investors get monthly updates; warm prospects get a low-frequency cadence.',
  },
}

const ONBOARDING_ORDER: OnboardingStep[] = [
  'connect_accounting',
  'first_plan_line',
  'define_thesis',
  'create_round',
  'log_first_touch',
  'send_first_update',
]

export function MoneySettingsView({ settings }: { settings: MoneySettings }) {
  return (
    <div className="space-y-6">
      <SettingsForm initial={settings} />
      <OnboardingChecklist initial={settings.onboarding_progress} />
    </div>
  )
}

function SettingsForm({ initial }: { initial: MoneySettings }) {
  const [draft, setDraft] = useState<MoneySettings>(initial)
  const [isPending, startTransition] = useTransition()

  const dirty =
    draft.currency !== initial.currency ||
    draft.fiscal_year_start_month !== initial.fiscal_year_start_month ||
    draft.runway_danger_weeks !== initial.runway_danger_weeks ||
    draft.runway_healthy_weeks !== initial.runway_healthy_weeks ||
    draft.variance_alert_pct !== initial.variance_alert_pct ||
    draft.large_expense_threshold_cents !== initial.large_expense_threshold_cents ||
    draft.retention_years !== initial.retention_years ||
    draft.specialist_model_tier !== initial.specialist_model_tier

  const validationError = (() => {
    if (draft.runway_healthy_weeks <= draft.runway_danger_weeks) {
      return 'Healthy threshold must be greater than danger threshold.'
    }
    return null
  })()

  function handleSave() {
    if (validationError) {
      toast.error(validationError)
      return
    }
    startTransition(async () => {
      const result = await updateMoneySettings({
        currency: draft.currency,
        fiscal_year_start_month: draft.fiscal_year_start_month,
        runway_danger_weeks: draft.runway_danger_weeks,
        runway_healthy_weeks: draft.runway_healthy_weeks,
        variance_alert_pct: draft.variance_alert_pct,
        large_expense_threshold_cents: draft.large_expense_threshold_cents,
        retention_years: draft.retention_years,
        specialist_model_tier: draft.specialist_model_tier,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setDraft({ ...draft, ...result.settings })
      toast.success('Settings saved.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Defaults</CardTitle>
        <CardDescription>Used by the cockpit, plan, and variance views.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="currency">Reporting currency</Label>
            <Input
              id="currency"
              maxLength={3}
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
              placeholder="GBP"
            />
            <p className="text-xs text-muted-foreground">ISO 4217 three-letter code.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fiscal-month">Fiscal year start month</Label>
            <Select
              value={String(draft.fiscal_year_start_month)}
              onValueChange={(v) => setDraft({ ...draft, fiscal_year_start_month: Number(v) })}
            >
              <SelectTrigger id="fiscal-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FISCAL_MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="danger">Runway danger threshold (weeks)</Label>
            <Input
              id="danger"
              type="number"
              min={1}
              max={520}
              value={draft.runway_danger_weeks}
              onChange={(e) =>
                setDraft({ ...draft, runway_danger_weeks: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Cockpit shows a critical badge below this value.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="healthy">Runway healthy threshold (weeks)</Label>
            <Input
              id="healthy"
              type="number"
              min={1}
              max={520}
              value={draft.runway_healthy_weeks}
              onChange={(e) =>
                setDraft({ ...draft, runway_healthy_weeks: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              At or above this value the cockpit is green.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="variance">Variance alert percent</Label>
            <Input
              id="variance"
              type="number"
              min={0}
              max={100}
              value={draft.variance_alert_pct}
              onChange={(e) =>
                setDraft({ ...draft, variance_alert_pct: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Per-category variance over this percent triggers a Today signal.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="large-expense">Large-expense threshold ({draft.currency})</Label>
            <Input
              id="large-expense"
              type="number"
              min={0}
              step={1}
              value={draft.large_expense_threshold_cents / 100}
              onChange={(e) => {
                const major = Number(e.target.value) || 0
                setDraft({
                  ...draft,
                  large_expense_threshold_cents: Math.round(major * 100),
                })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Single transactions above this amount get flagged for review.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="retention">Audit retention (years)</Label>
            <Input
              id="retention"
              type="number"
              min={1}
              max={50}
              value={draft.retention_years}
              onChange={(e) => setDraft({ ...draft, retention_years: Number(e.target.value) || 1 })}
            />
            <p className="text-xs text-muted-foreground">
              How long Money-section audit rows are kept before archive.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier">Specialist model tier</Label>
            <Select
              value={draft.specialist_model_tier}
              onValueChange={(v) =>
                setDraft({ ...draft, specialist_model_tier: v as SpecialistModelTier })
              }
            >
              <SelectTrigger id="tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="haiku">Haiku — fastest, cheapest</SelectItem>
                <SelectItem value="sonnet">Sonnet — balanced (recommended)</SelectItem>
                <SelectItem value="opus">Opus — most capable, highest cost</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default tier for specialist invocations. Per-task overrides may apply.
            </p>
          </div>
        </div>

        {validationError && (
          <p className="text-xs text-destructive">{validationError}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <Badge variant="warning">Unsaved changes</Badge>
          )}
          <Button onClick={handleSave} disabled={!dirty || isPending || !!validationError}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function OnboardingChecklist({ initial }: { initial: OnboardingProgress }) {
  const [progress, setProgress] = useState<OnboardingProgress>(initial)
  const [pendingStep, setPendingStep] = useState<OnboardingStep | null>(null)

  const completed = ONBOARDING_ORDER.filter((s) => progress[s]).length

  function toggle(step: OnboardingStep) {
    const next = !progress[step]
    setPendingStep(step)
    // Optimistic update.
    setProgress((p) => ({ ...p, [step]: next }))
    void markOnboardingStep(step, next).then((result) => {
      if ('error' in result) {
        // Roll back.
        setProgress((p) => ({ ...p, [step]: !next }))
        toast.error(result.error)
      } else {
        setProgress(result.progress)
      }
      setPendingStep(null)
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Onboarding checklist</CardTitle>
            <CardDescription>Six steps to make Money do the heavy lifting.</CardDescription>
          </div>
          <Badge variant="secondary">{completed} / {ONBOARDING_ORDER.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {ONBOARDING_ORDER.map((step) => {
            const done = progress[step]
            const meta = ONBOARDING_LABELS[step]
            const busy = pendingStep === step
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => toggle(step)}
                  disabled={busy}
                  aria-pressed={done}
                  className={`w-full text-left flex items-start gap-3 rounded-md border border-border px-3 py-3 transition-colors ${done ? 'bg-success/5' : 'bg-background hover:bg-muted/50'} ${busy ? 'opacity-60' : ''}`}
                >
                  <span className="mt-0.5 shrink-0">
                    {done ? (
                      <Check className="h-5 w-5 text-success" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-medium ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {meta.title}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {meta.helper}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
