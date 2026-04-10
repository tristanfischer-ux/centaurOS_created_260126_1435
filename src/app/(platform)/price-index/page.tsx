/**
 * @file page.tsx — UKSHI Price Index
 *
 * @description Server component that fetches 26-week price history from Supabase,
 * generates 26-week forecasts, and renders the chart + table. Supports category
 * and per-product views via search params.
 *
 * Search params:
 *   - view: "category" (default) | "product"
 *   - category: filter by product_category (e.g. "Herb")
 */

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { generateForecast, type ForecastPoint } from '@/lib/price-index/forecast'
import { PriceChart, type ChartDataPoint, type ChartSeries, getProductColor } from '@/components/price-index/PriceChart'
import { PriceTable, type PriceTableRow } from '@/components/price-index/PriceTable'
import { PriceViewToggle } from '@/components/price-index/ViewToggle'
import { CategoryFilter } from '@/components/price-index/CategoryFilter'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { getChartColor } from '@/lib/chart-colors'
import { AlertTriangle } from 'lucide-react'

// DECISION: 182 days = 26 weeks lookback
const LOOKBACK_DAYS = 182

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  Herb: 'hsl(160, 84%, 39%)',
  Microgreen: 'hsl(217, 91%, 60%)',
  'Edible Flower': 'hsl(330, 81%, 60%)',
  'Salad Leaf': 'hsl(38, 92%, 50%)',
  Sprout: 'hsl(258, 90%, 66%)',
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Props {
  searchParams: Promise<{ view?: string; category?: string }>
}

export default async function PriceIndexPage({ searchParams }: Props) {
  const params = await searchParams
  const view = (params.view === 'product' ? 'product' : 'category') as 'category' | 'product'
  const categoryFilter = params.category ?? null

  const supabase = await createClient()

  // ─── Calculate date range ───
  const now = new Date()
  const lookbackDate = new Date(now)
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS)
  const fromDate = lookbackDate.toISOString().slice(0, 10)

  if (view === 'product') {
    return (
      <div className="space-y-6">
        <PageHeader view={view} />
        <Suspense fallback={<ChartSkeleton />}>
          <ProductView
            supabase={supabase}
            fromDate={fromDate}
            categoryFilter={categoryFilter}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader view={view} />
      <Suspense fallback={<ChartSkeleton />}>
        <CategoryView
          supabase={supabase}
          fromDate={fromDate}
          categoryFilter={categoryFilter}
        />
      </Suspense>
    </div>
  )
}

// ─── Page Header ───
function PageHeader({ view }: { view: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">UKSHI Price Index</h1>
        <p className="text-sm text-muted-foreground mt-1">
          UK Specialty Herb Index — 26-week history with 26-week forecast
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Suspense fallback={null}>
          <PriceViewToggle />
        </Suspense>
        <Suspense fallback={null}>
          <CategoryFilter />
        </Suspense>
      </div>
    </div>
  )
}

// ─── Category View ───
async function CategoryView({
  supabase,
  fromDate,
  categoryFilter,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  fromDate: string
  categoryFilter: string | null
}) {
  // Fetch category-level aggregates (product_id IS NULL, quality_grade IS NULL)
  let query = supabase
    .from('price_index')
    .select('week_start, product_category, avg_price_per_kg, volume_kg, sample_count')
    .is('product_id', null)
    .is('quality_grade', null)
    .gte('week_start', fromDate)
    .order('week_start', { ascending: true })

  if (categoryFilter) {
    query = query.eq('product_category', categoryFilter)
  }

  const { data: rawData, error } = await query

  if (error) {
    return <ErrorCard message={error.message} />
  }

  if (!rawData || rawData.length === 0) {
    return <EmptyCard />
  }

  // Group by category → generate forecasts
  const byCategory = new Map<string, { weekStart: string; price: number }[]>()
  for (const row of rawData) {
    const cat = row.product_category
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push({
      weekStart: row.week_start,
      price: Number(row.avg_price_per_kg),
    })
  }

  // Generate forecast for each category
  const forecastByCategory = new Map<string, ForecastPoint[]>()
  for (const [cat, history] of byCategory) {
    forecastByCategory.set(cat, generateForecast(history))
  }

  // Build chart data: merge all categories into unified data points by week
  const weekMap = new Map<string, ChartDataPoint>()
  let forecastBoundary: string | undefined

  for (const [cat, points] of forecastByCategory) {
    const catKey = cat.toLowerCase().replace(/\s+/g, '-')
    for (const point of points) {
      if (!weekMap.has(point.weekStart)) {
        const label = formatWeekLabel(point.weekStart)
        weekMap.set(point.weekStart, {
          label,
          weekStart: point.weekStart,
          isForecast: point.isForecast,
        })
      }
      const entry = weekMap.get(point.weekStart)!
      entry[catKey] = point.price
      if (point.isForecast && !forecastBoundary) {
        // The boundary is the last historical week label
        const allKeys = Array.from(weekMap.keys()).sort()
        const idx = allKeys.indexOf(point.weekStart)
        if (idx > 0) {
          forecastBoundary = formatWeekLabel(allKeys[idx - 1])
        }
      }
    }
  }

  const chartData = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart),
  )

  const series: ChartSeries[] = Array.from(byCategory.keys()).map((cat, i) => ({
    key: cat.toLowerCase().replace(/\s+/g, '-'),
    label: cat,
    color: CATEGORY_COLORS[cat] ?? getChartColor(i),
  }))

  // Build table rows (most recent weeks first)
  const tableRows: PriceTableRow[] = rawData
    .slice()
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map((row) => ({
      weekStart: row.week_start,
      productCategory: row.product_category,
      qualityGrade: null,
      productName: null,
      avgPricePerKg: Number(row.avg_price_per_kg),
      volumeKg: Number(row.volume_kg),
      sampleCount: row.sample_count,
    }))

  // Calculate week-over-week changes
  addWeekChanges(tableRows)

  return (
    <>
      <PriceChart
        data={chartData}
        series={series}
        forecastBoundary={forecastBoundary}
        mode="category"
      />
      <ForecastDisclaimer />
      <PriceTable rows={tableRows.slice(0, 50)} mode="category" />
    </>
  )
}

// ─── Product View ───
async function ProductView({
  supabase,
  fromDate,
  categoryFilter,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  fromDate: string
  categoryFilter: string | null
}) {
  // Fetch per-product data (product_id IS NOT NULL)
  let query = supabase
    .from('price_index')
    .select('week_start, product_category, product_id, avg_price_per_kg, volume_kg, sample_count')
    .not('product_id', 'is', null)
    .is('quality_grade', null)
    .gte('week_start', fromDate)
    .order('week_start', { ascending: true })

  if (categoryFilter) {
    query = query.eq('product_category', categoryFilter)
  }

  const { data: rawData, error } = await query

  if (error) {
    return <ErrorCard message={error.message} />
  }

  // Fetch product names
  const productIds = [...new Set((rawData ?? []).map((r) => r.product_id).filter(Boolean))]

  let productNames = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds as string[])

    if (products) {
      productNames = new Map(products.map((p) => [p.id, p.name]))
    }
  }

  if (!rawData || rawData.length === 0) {
    return <EmptyCard />
  }

  // Group by product_id → generate forecasts
  const byProduct = new Map<string, { id: string; name: string; history: { weekStart: string; price: number }[] }>()
  for (const row of rawData) {
    const pid = row.product_id as string
    if (!byProduct.has(pid)) {
      byProduct.set(pid, {
        id: pid,
        name: productNames.get(pid) ?? 'Unknown',
        history: [],
      })
    }
    byProduct.get(pid)!.history.push({
      weekStart: row.week_start,
      price: Number(row.avg_price_per_kg),
    })
  }

  // DECISION: Limit to top 15 products by total volume to keep chart readable
  const productEntries = Array.from(byProduct.values())
  const volumeByProduct = new Map<string, number>()
  for (const row of rawData) {
    const pid = row.product_id as string
    volumeByProduct.set(pid, (volumeByProduct.get(pid) ?? 0) + Number(row.volume_kg))
  }
  productEntries.sort(
    (a, b) => (volumeByProduct.get(b.id) ?? 0) - (volumeByProduct.get(a.id) ?? 0),
  )
  const topProducts = productEntries.slice(0, 15)

  // Generate forecasts
  const forecastByProduct = new Map<string, { name: string; slug: string; points: ForecastPoint[] }>()
  for (const product of topProducts) {
    const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    forecastByProduct.set(product.id, {
      name: product.name,
      slug,
      points: generateForecast(product.history),
    })
  }

  // Build chart data
  const weekMap = new Map<string, ChartDataPoint>()
  let forecastBoundary: string | undefined

  for (const [, { slug, points }] of forecastByProduct) {
    for (const point of points) {
      if (!weekMap.has(point.weekStart)) {
        weekMap.set(point.weekStart, {
          label: formatWeekLabel(point.weekStart),
          weekStart: point.weekStart,
          isForecast: point.isForecast,
        })
      }
      weekMap.get(point.weekStart)![slug] = point.price
      if (point.isForecast && !forecastBoundary) {
        const allKeys = Array.from(weekMap.keys()).sort()
        const idx = allKeys.indexOf(point.weekStart)
        if (idx > 0) {
          forecastBoundary = formatWeekLabel(allKeys[idx - 1])
        }
      }
    }
  }

  const chartData = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart),
  )

  const series: ChartSeries[] = Array.from(forecastByProduct.values()).map(({ name, slug }, i) => ({
    key: slug,
    label: name,
    color: getProductColor(i),
  }))

  // Build table rows
  const tableRows: PriceTableRow[] = rawData
    .filter((row) => topProducts.some((p) => p.id === row.product_id))
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map((row) => ({
      weekStart: row.week_start,
      productCategory: row.product_category,
      qualityGrade: null,
      productName: productNames.get(row.product_id as string) ?? 'Unknown',
      avgPricePerKg: Number(row.avg_price_per_kg),
      volumeKg: Number(row.volume_kg),
      sampleCount: row.sample_count,
    }))

  addWeekChanges(tableRows)

  return (
    <>
      <PriceChart
        data={chartData}
        series={series}
        forecastBoundary={forecastBoundary}
        mode="product"
      />
      <ForecastDisclaimer />
      <PriceTable rows={tableRows.slice(0, 50)} mode="product" />
    </>
  )
}

// ─── Helpers ───

/** Calculate week-over-week % change for table rows (sorted newest-first) */
function addWeekChanges(rows: PriceTableRow[]) {
  const priceMap = new Map<string, number>()
  // Process oldest-first to build previous-week prices
  const sorted = rows.slice().sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  for (const row of sorted) {
    const key = `${row.productName ?? row.productCategory}-${row.qualityGrade ?? 'agg'}`
    const prev = priceMap.get(key)
    if (prev != null && prev > 0) {
      row.weekChange = ((row.avgPricePerKg - prev) / prev) * 100
    }
    priceMap.set(key, row.avgPricePerKg)
  }
}

function ForecastDisclaimer() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Forecast prices are statistical projections based on historical trends and seasonal patterns.
          They are not guaranteed and should be used for planning purposes only. Actual prices may
          vary based on market conditions, weather, and supply chain factors.
        </p>
      </CardContent>
    </Card>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-destructive">Failed to load price data: {message}</p>
      </CardContent>
    </Card>
  )
}

function EmptyCard() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No price data available. Run the seed script to populate initial data.
        </p>
      </CardContent>
    </Card>
  )
}

function ChartSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}
