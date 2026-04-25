import { AlertCircle, BarChart3, Coins, FileWarning, ServerCrash, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { typography } from '@/lib/design-system'
import { CostDashboardView, type DailyCost } from './cost-dashboard-view'

/**
 * /admin/cost — Tier -1 cost-logging dashboard.
 *
 * @description Reads `public.llm_usage` via the admin client (service role,
 * RLS bypass) because this page intentionally aggregates across every foundry
 * on the platform. Tristan-only gate is enforced by the sibling layout.
 *
 * Aggregations are computed in memory from the last 30 days of rows. With
 * the table indexed on `(action, created_at desc)` and Tristan-only access,
 * the row volume here is well within the budget for a single round trip.
 *
 * @audit Cross-foundry read. Never expose to non-Tristan accounts. The
 * layout at src/app/(platform)/admin/cost/layout.tsx is the gate.
 */

// FLOW: Disable caching — Tristan refreshes this page to see the latest
// numbers. Static rendering would defeat the purpose.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// DECISION: Cost rows are written in USD (cost_usd). Conversion uses the
// same 1.25 USD/GBP rate that the price map at src/lib/cost-logging/llm-usage.ts
// was built against, so reported figures stay consistent with pricing brief.
const USD_PER_GBP = 1.25

// Top-N caps per section. Pulled out so they're easy to tune.
const TOP_ACTIONS_LIMIT = 20
const TOP_FOUNDRIES_LIMIT = 10
const TOP_ERRORS_LIMIT = 20

// Schema-aware row shape — keep this aligned with src/types/database.types.ts
interface UsageRow {
  id: string
  foundry_id: string | null
  user_id: string | null
  action: string
  model_used: string
  cost_usd: number | string
  status: string
  error_message: string | null
  created_at: string
}

interface SubscriptionRow {
  user_id: string
  tier: string
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatGbpCompact(amount: number): string {
  // Used for chart axis labels where space is tight.
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function usdToGbp(usd: number): number {
  return usd / USD_PER_GBP
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface AggregatedData {
  totals: {
    last7Cost: number
    last30Cost: number
    last7Calls: number
    last30Calls: number
    last7DailyAvg: number
    last7FailureRate: number
  }
  daily: DailyCost[]
  topActions: Array<{ action: string; calls: number; totalCost: number }>
  topModels: Array<{ model: string; calls: number; totalCost: number; avgCost: number }>
  byTier: Array<{ tier: string; calls: number; totalCost: number }>
  topFoundries: Array<{ foundryIdShort: string; calls: number; totalCost: number }>
  errors: Array<{ action: string; messageSnippet: string; count: number; lastSeenIso: string }>
}

function aggregate(rows: UsageRow[], subs: SubscriptionRow[]): AggregatedData {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  const userTier = new Map<string, string>()
  for (const sub of subs) {
    if (sub.user_id) userTier.set(sub.user_id, sub.tier)
  }

  // 30-day rolling totals
  let last7Cost = 0
  let last30Cost = 0
  let last7Calls = 0
  let last30Calls = 0
  let last7Errors = 0

  // Per-day bucket — keyed by yyyy-mm-dd, last 30 days
  const dayBuckets = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000)
    dayBuckets.set(isoDate(d), 0)
  }

  // Action / model / tier / foundry / error tallies — last 7 days unless
  // otherwise noted in the field name.
  const actionStats = new Map<string, { calls: number; totalCostGbp: number }>()
  const modelStats = new Map<string, { calls: number; totalCostGbp: number }>()
  const tierStats30 = new Map<string, { calls: number; totalCostGbp: number }>()
  const foundryStats30 = new Map<string, { calls: number; totalCostGbp: number }>()
  const errorStats = new Map<
    string,
    { action: string; messageSnippet: string; count: number; lastSeenMs: number }
  >()

  for (const row of rows) {
    const ts = new Date(row.created_at).getTime()
    const costUsd = typeof row.cost_usd === 'string' ? Number(row.cost_usd) : row.cost_usd
    const costGbp = usdToGbp(Number.isFinite(costUsd) ? costUsd : 0)

    if (ts >= thirtyDaysAgo) {
      last30Cost += costGbp
      last30Calls += 1
      // Daily bucket
      const dayKey = isoDate(new Date(ts))
      if (dayBuckets.has(dayKey)) {
        dayBuckets.set(dayKey, (dayBuckets.get(dayKey) ?? 0) + costGbp)
      }
      // Tier breakdown — uses joined user subscription data, falling back
      // to "anonymous" when the row had no user_id (pre-signup) and to
      // "free" when the user has no subscription row.
      let tierLabel: string
      if (!row.user_id) {
        tierLabel = 'anonymous'
      } else {
        tierLabel = userTier.get(row.user_id) ?? 'free'
      }
      const tier = tierStats30.get(tierLabel) ?? { calls: 0, totalCostGbp: 0 }
      tier.calls += 1
      tier.totalCostGbp += costGbp
      tierStats30.set(tierLabel, tier)

      // Foundry breakdown — last 30 days. Anonymous (no foundry_id) rows
      // are counted under a synthetic "(anonymous)" bucket so they're not
      // silently dropped.
      const foundryKey = row.foundry_id ? row.foundry_id.slice(0, 8) : '(anon)'
      const f = foundryStats30.get(foundryKey) ?? { calls: 0, totalCostGbp: 0 }
      f.calls += 1
      f.totalCostGbp += costGbp
      foundryStats30.set(foundryKey, f)
    }

    if (ts >= sevenDaysAgo) {
      last7Cost += costGbp
      last7Calls += 1
      if (row.status !== 'success') last7Errors += 1

      const a = actionStats.get(row.action) ?? { calls: 0, totalCostGbp: 0 }
      a.calls += 1
      a.totalCostGbp += costGbp
      actionStats.set(row.action, a)

      const m = modelStats.get(row.model_used) ?? { calls: 0, totalCostGbp: 0 }
      m.calls += 1
      m.totalCostGbp += costGbp
      modelStats.set(row.model_used, m)

      if (row.status === 'error' || row.status === 'timeout' || row.status === 'rate_limited') {
        const snippet = (row.error_message ?? '(no message)').slice(0, 120)
        const key = `${row.action}::${snippet}`
        const e = errorStats.get(key) ?? {
          action: row.action,
          messageSnippet: snippet,
          count: 0,
          lastSeenMs: 0,
        }
        e.count += 1
        if (ts > e.lastSeenMs) e.lastSeenMs = ts
        errorStats.set(key, e)
      }
    }
  }

  const daily: DailyCost[] = Array.from(dayBuckets.entries()).map(([date, cost]) => ({
    date,
    cost,
  }))

  const topActions = Array.from(actionStats.entries())
    .map(([action, s]) => ({ action, calls: s.calls, totalCost: s.totalCostGbp }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, TOP_ACTIONS_LIMIT)

  const topModels = Array.from(modelStats.entries())
    .map(([model, s]) => ({
      model,
      calls: s.calls,
      totalCost: s.totalCostGbp,
      avgCost: s.calls > 0 ? s.totalCostGbp / s.calls : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)

  const byTier = Array.from(tierStats30.entries())
    .map(([tier, s]) => ({ tier, calls: s.calls, totalCost: s.totalCostGbp }))
    .sort((a, b) => b.totalCost - a.totalCost)

  const topFoundries = Array.from(foundryStats30.entries())
    .map(([foundryIdShort, s]) => ({
      foundryIdShort,
      calls: s.calls,
      totalCost: s.totalCostGbp,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, TOP_FOUNDRIES_LIMIT)

  const errors = Array.from(errorStats.values())
    .sort((a, b) => b.count - a.count || b.lastSeenMs - a.lastSeenMs)
    .slice(0, TOP_ERRORS_LIMIT)
    .map((e) => ({
      action: e.action,
      messageSnippet: e.messageSnippet,
      count: e.count,
      lastSeenIso: new Date(e.lastSeenMs).toISOString(),
    }))

  return {
    totals: {
      last7Cost,
      last30Cost,
      last7Calls,
      last30Calls,
      last7DailyAvg: last7Cost / 7,
      last7FailureRate: last7Calls > 0 ? last7Errors / last7Calls : 0,
    },
    daily,
    topActions,
    topModels,
    byTier,
    topFoundries,
    errors,
  }
}

interface FetchResult {
  rows: UsageRow[]
  subs: SubscriptionRow[]
  errorMessage: string | null
}

async function fetchData(): Promise<FetchResult> {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // GOTCHA: We pull up to 30 days of rows and aggregate in memory rather
    // than running 7 separate aggregations server-side. For a Tristan-only
    // dashboard with current volume (Tier -1 just landed) this is well
    // within budget; if this ever gets hot, push the aggregation into a
    // Postgres function with a daily materialised view.
    const { data: usageRows, error: usageError } = await supabase
      .from('llm_usage')
      .select(
        'id, foundry_id, user_id, action, model_used, cost_usd, status, error_message, created_at',
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50000)

    if (usageError) {
      return { rows: [], subs: [], errorMessage: usageError.message }
    }

    const { data: subRows, error: subError } = await supabase
      .from('user_subscriptions')
      .select('user_id, tier')

    if (subError) {
      // Tier breakdown is a nice-to-have — surface the rest of the dashboard
      // even if subscriptions read fails.
      return {
        rows: (usageRows as UsageRow[]) ?? [],
        subs: [],
        errorMessage: `Tier join unavailable: ${subError.message}`,
      }
    }

    return {
      rows: (usageRows as UsageRow[]) ?? [],
      subs: (subRows as SubscriptionRow[]) ?? [],
      errorMessage: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { rows: [], subs: [], errorMessage: message }
  }
}

export default async function AdminCostPage() {
  const { rows, subs, errorMessage } = await fetchData()
  const data = aggregate(rows, subs)
  const generatedAt = new Date().toISOString()
  const hasAnyRows = rows.length > 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Cost dashboard</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Tristan-only. Reads from llm_usage across every foundry.
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Generated {generatedAt}
        </div>
      </div>

      {errorMessage ? (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border border-destructive bg-status-error-light text-destructive"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Could not load some figures.</p>
            <p className="opacity-90 mt-1">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total spend, last 7 days"
          value={formatGbp(data.totals.last7Cost)}
          sublabel={`${data.totals.last7Calls.toLocaleString('en-GB')} calls`}
        />
        <StatTile
          label="Total spend, last 30 days"
          value={formatGbp(data.totals.last30Cost)}
          sublabel={`${data.totals.last30Calls.toLocaleString('en-GB')} calls`}
        />
        <StatTile
          label="Daily average, last 7 days"
          value={formatGbp(data.totals.last7DailyAvg)}
          sublabel="Mean cost per day"
        />
        <StatTile
          label="Failure rate, last 7 days"
          value={`${(data.totals.last7FailureRate * 100).toFixed(1)}%`}
          sublabel={`${Math.round(
            data.totals.last7FailureRate * data.totals.last7Calls,
          ).toLocaleString('en-GB')} of ${data.totals.last7Calls.toLocaleString('en-GB')} calls`}
          tone={data.totals.last7FailureRate > 0.05 ? 'warn' : 'ok'}
        />
      </div>

      {/* Daily spend chart — interactive client component */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-international-orange" />
            Daily spend, last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAnyRows ? (
            <CostDashboardView daily={data.daily} formatLabel={(v) => formatGbpCompact(v)} />
          ) : (
            <EmptyState
              icon={<Coins className="h-10 w-10" />}
              title="No LLM calls logged yet"
              description="The llm_usage table is empty for the last 30 days. Trigger a brainstorm, an investor search, or any specialist run, then refresh."
            />
          )}
        </CardContent>
      </Card>

      {/* Top action slugs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-international-orange" />
            Top actions, last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0">
          {data.topActions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topActions.map((row) => (
                  <TableRow key={row.action}>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell className="text-right">
                      {row.calls.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatGbp(row.calls > 0 ? row.totalCost / row.calls : 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatGbp(row.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No actions logged in the last 7 days"
              description="Once any specialist run, brainstorm, or investor search fires, the action shows up here."
            />
          )}
        </CardContent>
      </Card>

      {/* Top models */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-international-orange" />
            Top models, last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0">
          {data.topModels.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Avg cost / call</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topModels.map((row) => (
                  <TableRow key={row.model}>
                    <TableCell className="font-mono text-xs">{row.model}</TableCell>
                    <TableCell className="text-right">
                      {row.calls.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right">{formatGbp(row.avgCost)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatGbp(row.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No model usage in the last 7 days"
              description="Models populate as soon as one LLM call lands in llm_usage."
            />
          )}
        </CardContent>
      </Card>

      {/* Spend by tier */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Coins className="h-4 w-4 text-international-orange" />
            Spend by tier, last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0">
          {data.byTier.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byTier.map((row) => (
                  <TableRow key={row.tier}>
                    <TableCell className="font-mono text-xs">{row.tier}</TableCell>
                    <TableCell className="text-right">
                      {row.calls.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatGbp(row.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No tier-attributable spend yet"
              description="Tier comes from user_subscriptions. Anonymous and free users land in their own buckets when calls are logged."
            />
          )}
        </CardContent>
      </Card>

      {/* Top foundries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-international-orange" />
            Top foundries, last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0">
          {data.topFoundries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Foundry (first 8 chars)</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topFoundries.map((row) => (
                  <TableRow key={row.foundryIdShort}>
                    <TableCell className="font-mono text-xs">{row.foundryIdShort}</TableCell>
                    <TableCell className="text-right">
                      {row.calls.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatGbp(row.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No foundry-attributable spend yet"
              description="Once a logged-in user triggers an LLM call, the originating foundry appears here."
            />
          )}
        </CardContent>
      </Card>

      {/* Recent errors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ServerCrash className="h-4 w-4 text-international-orange" />
            Recent errors, last 7 days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0 pt-0">
          {data.errors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.errors.map((row) => (
                  <TableRow key={`${row.action}-${row.messageSnippet}`}>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell className="text-xs">{row.messageSnippet}</TableCell>
                    <TableCell className="text-right">
                      {row.count.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.lastSeenIso.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<FileWarning className="h-10 w-10" />}
              title="No errors in the last 7 days"
              description="Every logged LLM call returned status=success. The fallback chains are holding."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatTile({
  label,
  value,
  sublabel,
  tone = 'ok',
}: {
  label: string
  value: string
  sublabel: string
  tone?: 'ok' | 'warn'
}) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
          {label}
        </div>
        <div
          className={
            tone === 'warn'
              ? 'mt-2 text-3xl font-display font-semibold text-warning'
              : 'mt-2 text-3xl font-display font-semibold text-foreground'
          }
        >
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>
      </CardContent>
    </Card>
  )
}
