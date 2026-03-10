'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Factory,
  FileText,
  Search,
  ArrowRight,
  Loader2,
  Sparkles,
  Users,
  Wrench,
  Cpu,
  Rocket,
  Radio,
} from 'lucide-react'
import { getRFQTemplates, getManufacturingRFQTemplates } from '@/actions/sector-skills'
import { cn } from '@/lib/utils'
import type { RFQTemplate } from '@/types/review-gates'
import { SECTOR_LABELS, type Sector } from '@/types/review-gates'

const SECTOR_ICONS: Partial<Record<Sector, React.ComponentType<{ className?: string }>>> = {
  robotics: Wrench,
  rockets: Rocket,
  satellites: Radio,
  'consumer-electronics': Cpu,
  'ai-datacentre': Cpu,
}

interface RFQTemplatePickerProps {
  /** Called when user selects a template - provides pre-fill data */
  onSelect: (template: {
    title: string
    category: string
    description: string
    rfqType: string
  }) => void
  /** Optional sector filter */
  sector?: string
  /** Whether to show only manufacturing templates */
  manufacturingOnly?: boolean
  /** Custom class name */
  className?: string
}

export function RFQTemplatePicker({
  onSelect,
  sector,
  manufacturingOnly = false,
  className,
}: RFQTemplatePickerProps) {
  const [templates, setTemplates] = useState<RFQTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const result = manufacturingOnly
        ? await getManufacturingRFQTemplates()
        : await getRFQTemplates(sector)

      if (!cancelled && !result.error) {
        setTemplates(result.data)
      }
      if (!cancelled) setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sector, manufacturingOnly])

  const filteredTemplates = searchQuery
    ? templates.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : templates

  const manufacturingTemplates = filteredTemplates.filter((t) => t.is_manufacturing)
  const otherTemplates = filteredTemplates.filter((t) => !t.is_manufacturing)

  const handleSelect = (template: RFQTemplate) => {
    onSelect({
      title: template.title,
      category: template.category || '',
      description: template.description || '',
      rfqType: template.rfq_type,
    })
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-status-warning" />
            Quick Start from Template
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick a template to pre-fill your RFQ
          </p>
        </div>
        {templates.length > 6 && (
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-7"
            />
          </div>
        )}
      </div>

      {/* Manufacturing Templates Section */}
      {manufacturingTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Factory className="h-3 w-3" />
            Manufacturing
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {manufacturingTemplates.map((template) => {
              const SectorIcon =
                template.sector
                  ? SECTOR_ICONS[template.sector as Sector] || FileText
                  : Factory
              return (
                <Card
                  key={template.id}
                  className="group hover:border-status-success/40 transition-colors cursor-pointer"
                  onClick={() => handleSelect(template)}
                >
                  <CardContent className="p-3 flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-status-success-light flex items-center justify-center shrink-0 mt-0.5">
                      <SectorIcon className="h-4 w-4 text-status-success" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">
                        {template.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {template.sector && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0"
                          >
                            {SECTOR_LABELS[template.sector as Sector] || template.sector}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 text-muted-foreground"
                        >
                          {template.rfq_type}
                        </Badge>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-status-success transition-colors shrink-0 mt-1" />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Other Templates Section */}
      {otherTemplates.length > 0 && !manufacturingOnly && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Users className="h-3 w-3" />
            People & Services
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {otherTemplates.map((template) => (
              <Card
                key={template.id}
                className="group hover:border-chart-5/40 transition-colors cursor-pointer"
                onClick={() => handleSelect(template)}
              >
                <CardContent className="p-3 flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-chart-5/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-4 w-4 text-chart-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {template.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {template.description}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-chart-5 transition-colors shrink-0 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {searchQuery ? 'No templates match your search' : 'No templates available'}
        </div>
      )}
    </div>
  )
}
