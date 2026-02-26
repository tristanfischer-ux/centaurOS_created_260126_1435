'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'

// ============================================================
// Types
// ============================================================

interface DonutChartDataItem {
  name: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutChartDataItem[]
  title: string
  height?: number
}

// ============================================================
// Component
// ============================================================

export function DonutChart({ data, title, height = 250 }: DonutChartProps) {
  // Filter out zero-value segments for cleaner rendering
  const filteredData = data.filter((d) => d.value > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={filteredData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="none"
            >
              {filteredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={((value: number) => formatCurrency(value)) as never}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => (
                <span style={{ color: 'hsl(var(--foreground))', fontSize: '12px' }}>
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
