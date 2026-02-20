'use client'

/**
 * @file CompletionTrendSection.tsx
 *
 * @description Completion trend section with Recharts bar chart visualization,
 * summary stats, and consistent section header with icon.
 */

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
import { BarChart3 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { ReportSectionHeader } from '@/components/reports/report-visuals'

import type { CompletionTrendSectionData, ReportTemplateId } from '@/lib/reports/report-document-types'

interface CompletionTrendSectionProps extends CompletionTrendSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

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
  templateId,
  sectionNumber,
}: CompletionTrendSectionProps): React.JSX.Element {
  const chartData = dataPoints.map((dp) => ({
    ...dp,
    label: formatXAxisDate(dp.date),
  }))

  const totalCompleted = dataPoints.reduce((sum, dp) => sum + dp.completed, 0)
  const totalCreated = dataPoints.reduce((sum, dp) => sum + dp.created, 0)
  const netProgress = totalCompleted - totalCreated

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Completion Trend"
        icon={BarChart3}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />

      {/* Summary stat pills */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl bg-international-orange/5 border border-international-orange/10 px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalCompleted}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Completed</p>
        </div>
        <div className="rounded-xl bg-electric-blue/5 border border-electric-blue/10 px-4 py-2.5 text-center">
          <p className="text-2xl font-display font-bold text-foreground">{totalCreated}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Created</p>
        </div>
        <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
          <p className={`text-2xl font-display font-bold ${netProgress >= 0 ? 'text-status-success' : 'text-destructive'}`}>
            {netProgress >= 0 ? '+' : ''}{netProgress}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Net Progress</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{periodLabel}</p>

      {/* Chart */}
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
