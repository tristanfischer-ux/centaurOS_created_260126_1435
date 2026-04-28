'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Layers, AlertTriangle, Sliders as SlidersIcon } from 'lucide-react'
import { updateScenarioSliders, type ScenarioDetail } from '@/actions/money-scenarios'
import {
  projectBurn,
  type Sliders,
} from '@/lib/money/scenario-projection'

function formatCurrency(cents: number | null): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function poundsStringFromCents(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toFixed(0)
}

function centsFromPoundsString(s: string): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function ScenarioDetailView({ scenario }: { scenario: ScenarioDetail }) {
  const activeOverrides = scenario.overrides.filter((o) => o.archived_at === null)
  const archivedOverrides = scenario.overrides.filter((o) => o.archived_at !== null)

  // Slider state — seeded from DB, dragged locally, saved on demand.
  const [sliders, setSliders] = useState<Sliders>(scenario.sliders)
  const [openingOverrideEnabled, setOpeningOverrideEnabled] = useState(
    scenario.sliders.opening_balance_cents !== null,
  )
  const [openingOverrideText, setOpeningOverrideText] = useState(
    poundsStringFromCents(scenario.sliders.opening_balance_cents),
  )
  const [isPending, startTransition] = useTransition()

  const dirty = useMemo(() => {
    const saved = scenario.sliders
    return (
      sliders.revenue_delay_weeks !== saved.revenue_delay_weeks ||
      sliders.cost_delay_weeks !== saved.cost_delay_weeks ||
      sliders.revenue_growth_pct !== saved.revenue_growth_pct ||
      sliders.opening_balance_cents !== saved.opening_balance_cents
    )
  }, [sliders, scenario.sliders])

  // Live 52-week projection — useMemo so dragging a slider is O(lines*52).
  const projection = useMemo(
    () =>
      projectBurn(scenario.planLines, sliders, scenario.defaultOpeningBalanceCents, {
        weeks: 52,
      }),
    [scenario.planLines, sliders, scenario.defaultOpeningBalanceCents],
  )

  const chartData = useMemo(
    () =>
      projection.weeks.map((w, i) => ({
        weekIndex: i + 1,
        week_start: w.week_start,
        cumulative_pounds: w.cumulative_cents / 100,
        cash_in_pounds: w.cash_in_cents / 100,
        cash_out_pounds: w.cash_out_cents / 100,
      })),
    [projection.weeks],
  )

  const handleSave = () => {
    const payload: Sliders = {
      ...sliders,
      opening_balance_cents: openingOverrideEnabled
        ? centsFromPoundsString(openingOverrideText)
        : null,
    }
    startTransition(async () => {
      const res = await updateScenarioSliders({
        scenarioId: scenario.id,
        sliders: payload,
      })
      if ('error' in res) {
        toast.error(res.error)
      } else {
        toast.success('Levers saved')
        // Keep local state aligned with what server will now return.
        setSliders(payload)
      }
    })
  }

  const handleReset = () => {
    setSliders(scenario.sliders)
    setOpeningOverrideEnabled(scenario.sliders.opening_balance_cents !== null)
    setOpeningOverrideText(poundsStringFromCents(scenario.sliders.opening_balance_cents))
  }

  const hasPlanLines = scenario.planLines.length > 0

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{scenario.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            {scenario.is_default && <Badge variant="success">Default</Badge>}
            <Badge variant="secondary">{scenario.template_source ?? 'custom'}</Badge>
            <Badge variant="outline">{scenario.visibility}</Badge>
          </div>
          {scenario.question && (
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">{scenario.question}</p>
          )}
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Back to plan</Button>
        </Link>
      </header>

      {scenario.archivedOverrideCount > 0 && (
        <Card>
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">
                {scenario.archivedOverrideCount} override{scenario.archivedOverrideCount === 1 ? '' : 's'} reference deleted plan lines
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                These overrides revert to 0 in projections. Restore the underlying plan line, or remove the override below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scenario levers — the legacy Cash Burn "drag a slider, watch runway move" interaction. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <SlidersIcon className="h-4 w-4" />
            Scenario levers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasPlanLines ? (
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No plan lines to project"
              description="Add plan lines before modelling levers — there is nothing to shift or grow yet."
              action={
                <Link href="/money/plan">
                  <Button size="sm">Go to plan</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <SliderControl
                id="revenue-delay"
                label="Revenue delay"
                value={sliders.revenue_delay_weeks}
                min={0}
                max={26}
                step={1}
                unit={sliders.revenue_delay_weeks === 1 ? 'week' : 'weeks'}
                onChange={(v) =>
                  setSliders((s) => ({ ...s, revenue_delay_weeks: v }))
                }
                help="Shift all cash-in lines forward by this many weeks."
              />
              <SliderControl
                id="cost-delay"
                label="Cost delay"
                value={sliders.cost_delay_weeks}
                min={0}
                max={26}
                step={1}
                unit={sliders.cost_delay_weeks === 1 ? 'week' : 'weeks'}
                onChange={(v) =>
                  setSliders((s) => ({ ...s, cost_delay_weeks: v }))
                }
                help="Push all cash-out lines out by this many weeks."
              />
              <SliderControl
                id="revenue-growth"
                label="Revenue growth"
                value={sliders.revenue_growth_pct}
                min={-50}
                max={100}
                step={1}
                unit="%"
                onChange={(v) =>
                  setSliders((s) => ({ ...s, revenue_growth_pct: v }))
                }
                help="Multiply every cash-in line by (1 + growth / 100)."
                showSign
              />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="opening-override"
                    checked={openingOverrideEnabled}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true
                      setOpeningOverrideEnabled(enabled)
                      if (!enabled) {
                        setSliders((s) => ({ ...s, opening_balance_cents: null }))
                      } else {
                        const cents = centsFromPoundsString(openingOverrideText)
                        setSliders((s) => ({ ...s, opening_balance_cents: cents }))
                      }
                    }}
                  />
                  <Label htmlFor="opening-override" className="text-sm font-medium cursor-pointer">
                    Override opening balance
                  </Label>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={`Default: ${formatCurrency(scenario.defaultOpeningBalanceCents)}`}
                  value={openingOverrideText}
                  disabled={!openingOverrideEnabled}
                  onChange={(e) => {
                    setOpeningOverrideText(e.target.value)
                    if (openingOverrideEnabled) {
                      const cents = centsFromPoundsString(e.target.value)
                      setSliders((s) => ({ ...s, opening_balance_cents: cents }))
                    }
                  }}
                  aria-label="Opening balance override (pounds)"
                />
                <p className="text-xs text-muted-foreground">
                  Unchecked uses the foundry default ({formatCurrency(scenario.defaultOpeningBalanceCents)}).
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasPlanLines && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              52-week cash projection
            </CardTitle>
            <RunwayBadge projection={projection} />
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <XAxis
                    dataKey="weekIndex"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: 'Week', position: 'insideBottom', offset: -2, fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat('en-GB', {
                        style: 'currency',
                        currency: 'GBP',
                        maximumFractionDigits: 0,
                        notation: 'compact',
                      }).format(v)
                    }
                  />
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                  <Tooltip
                    formatter={(v) =>
                      new Intl.NumberFormat('en-GB', {
                        style: 'currency',
                        currency: 'GBP',
                        maximumFractionDigits: 0,
                      }).format(Number(v))
                    }
                    labelFormatter={(label, items) => {
                      const row = items?.[0]?.payload as { week_start?: string } | undefined
                      return row?.week_start
                        ? `Week ${String(label)} — ${row.week_start}`
                        : `Week ${String(label)}`
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative_pounds"
                    name="Cumulative balance"
                    stroke="#ff4f00"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {hasPlanLines && (
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!dirty || isPending}>
            {isPending ? 'Saving…' : 'Save levers'}
          </Button>
          <Button variant="secondary" onClick={handleReset} disabled={!dirty || isPending}>
            Reset to saved
          </Button>
          {dirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overrides ({activeOverrides.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeOverrides.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-12 w-12" />}
              title="No overrides yet"
              description="Add an override from a plan line's detail page to model what changes in this scenario."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Line</th>
                    <th className="py-2 pr-4 text-right">Override amount</th>
                    <th className="py-2 pr-4">Override frequency</th>
                    <th className="py-2 pr-4">Effective</th>
                    <th className="py-2 pr-4">Probability</th>
                    <th className="py-2 pr-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOverrides.map((o) => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-4 font-medium">
                        {o.line_item_id ? (
                          <Link href={`/money/plan/item/${o.line_item_id}`} className="text-international-orange hover:underline">
                            {o.line_name ?? o.line_item_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground italic">deleted line</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {formatCurrency(o.override_amount_cents)}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{o.override_frequency ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {o.override_effective_from ? `from ${o.override_effective_from}` : '—'}
                        {o.override_effective_to ? ` to ${o.override_effective_to}` : ''}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {o.override_probability_pct === null ? '—' : `${o.override_probability_pct}%`}
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground max-w-xs truncate">
                        {o.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {archivedOverrides.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Archived overrides ({archivedOverrides.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {archivedOverrides.map((o) => (
                <li key={o.id}>
                  {o.line_name ?? o.line_item_id ?? 'unknown line'} · {formatCurrency(o.override_amount_cents)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SliderControl({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  help,
  showSign,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  help?: string
  showSign?: boolean
}) {
  const display = showSign && value > 0 ? `+${value}` : `${value}`
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <span className="text-sm font-mono tabular-nums text-foreground">
          {display} {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-international-orange cursor-pointer"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

function RunwayBadge({
  projection,
}: {
  projection: ReturnType<typeof projectBurn>
}) {
  if (projection.cashZeroWeek !== null) {
    return (
      <Badge variant="destructive">
        Cash-zero in {projection.cashZeroWeek + 1} week
        {projection.cashZeroWeek + 1 === 1 ? '' : 's'}
      </Badge>
    )
  }
  if (projection.runwayWeeks !== null) {
    return (
      <Badge variant="warning">
        Cash-zero in ~{projection.runwayWeeks} weeks (extrapolated)
      </Badge>
    )
  }
  return <Badge variant="success">Sustainable (52+ weeks positive)</Badge>
}
