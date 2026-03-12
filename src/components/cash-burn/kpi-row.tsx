'use client'

import { Card, CardContent } from '@/components/ui/card'
import { HelpTooltip } from '@/components/ui/help-tooltip'

interface KpiItem {
  label: string
  value: string
  detail?: string
  tooltip?: string
}

interface KpiRowProps {
  items: KpiItem[]
}

export function KpiRow({ items }: KpiRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {item.label}
              {item.tooltip && <HelpTooltip content={item.tooltip} side="right" className="ml-1 inline-flex align-middle" />}
            </p>
            <p className="text-2xl font-display font-bold text-foreground mt-1">{item.value}</p>
            {item.detail && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
