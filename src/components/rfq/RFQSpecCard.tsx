'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Cog,
  Layers,
  Palette,
  Ruler,
  Box,
} from 'lucide-react'

interface CadLabModule {
  name?: string
  process?: string
  material?: string
  finish?: string
  tolerance?: string
  dimensions?: {
    length?: number
    width?: number
    height?: number
    unit?: string
  }
}

interface RFQSpecCardProps {
  /** The custom_fields object from RFQ specifications */
  customFields?: Record<string, unknown>
  /** Fallback description text */
  description?: string
  className?: string
}

export function RFQSpecCard({
  customFields,
  description,
  className,
}: RFQSpecCardProps) {
  const modules = customFields?.modules as CadLabModule[] | undefined

  // If no structured data, fall back to description
  if (!modules || modules.length === 0) {
    if (!description) return null

    return (
      <div className={className}>
        <h3 className="font-semibold mb-2">Specifications</h3>
        <div className="p-4 rounded-lg bg-muted/50 whitespace-pre-wrap text-sm">
          {description}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="font-semibold">Specifications ({modules.length} modules)</h3>

      {/* Description if present alongside modules */}
      {description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
          {description}
        </p>
      )}

      <div className="space-y-2">
        {modules.map((mod, idx) => (
          <Card key={idx} className="border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{mod.name || `Module ${idx + 1}`}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {mod.process && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Cog className="w-3 h-3" />
                    {mod.process}
                  </Badge>
                )}
                {mod.material && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Layers className="w-3 h-3" />
                    {mod.material}
                  </Badge>
                )}
                {mod.finish && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Palette className="w-3 h-3" />
                    {mod.finish}
                  </Badge>
                )}
                {mod.tolerance && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Ruler className="w-3 h-3" />
                    {mod.tolerance}
                  </Badge>
                )}
                {mod.dimensions && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {[mod.dimensions.length, mod.dimensions.width, mod.dimensions.height]
                      .filter(v => v != null)
                      .join(' x ')}
                    {mod.dimensions.unit ? ` ${mod.dimensions.unit}` : ' mm'}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
