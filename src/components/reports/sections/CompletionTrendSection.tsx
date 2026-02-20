'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

import { Card, CardContent } from '@/components/ui/card'

import type { CompletionTrendSectionData } from '@/lib/reports/report-document-types'

type CompletionTrendSectionProps = CompletionTrendSectionData

const INTERNATIONAL_ORANGE = 'hsl(14, 100%, 50%)'
const ELECTRIC_BLUE = 'hsl(217, 91%, 60%)'

function formatXAxisDate(dateStr: string): string {
  const d = new Date(dateStr)
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d)
  return `${day} ${d.getDate()}`
}

export function CompletionTrendSection({
  dataPoints,
  periodLabel,
}: CompletionTrendSectionProps) {
  const chartData = dataPoints.map((dp) => ({
    ...dp,
    label: formatXAxisDate(dp.date),
  }))

  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Completion Trend
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">{periodLabel}</p>

      <Card>
        <CardContent className="p-6 pt-6">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: 'hsl(215, 16%, 47%)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: 'hsl(215, 16%, 47%)' }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(214, 32%, 91%)',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  formatter={(value: string) => (
                    <span style={{ color: 'hsl(222, 47%, 11%)', fontSize: '13px' }}>{value}</span>
                  )}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill={INTERNATIONAL_ORANGE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="created"
                  name="Created"
                  fill={ELECTRIC_BLUE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
