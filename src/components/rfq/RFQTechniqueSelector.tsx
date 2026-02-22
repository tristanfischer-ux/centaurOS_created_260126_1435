'use client'

/**
 * RFQTechniqueSelector — Lets users pick a manufacturing technique when
 * creating an RFQ. Can be prefilled from the Techniques Explorer via
 * the ?technique= URL parameter.
 *
 * @description Collapsible section that shows the selected technique
 * (if any) with a link to learn more, or a search/select to pick one.
 * Techniques from the static dataset are presented in a combobox-style
 * select grouped by category.
 *
 * @component
 */

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Factory, X, ExternalLink, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  ALL_TECHNIQUES,
  getTechniqueById,
  CATEGORY_LABELS,
  TECHNIQUE_CATEGORIES,
} from '@/lib/manufacturing-techniques'
import type { ManufacturingTechnique, TechniqueCategory } from '@/lib/manufacturing-techniques/types'

interface RFQTechniqueSelectorProps {
  /** Currently selected technique ID */
  selectedTechniqueId: string | null
  /** Called when a technique is selected or cleared */
  onSelect: (id: string | null) => void
  /** Whether the selector is disabled */
  disabled?: boolean
}

export function RFQTechniqueSelector({
  selectedTechniqueId,
  onSelect,
  disabled = false,
}: RFQTechniqueSelectorProps) {
  const searchParams = useSearchParams()

  // Prefill from URL param on mount
  useEffect(() => {
    const techniqueSlug = searchParams?.get('technique')
    if (techniqueSlug && !selectedTechniqueId) {
      const technique = getTechniqueById(techniqueSlug)
      if (technique) {
        onSelect(technique.id)
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedTechnique = selectedTechniqueId
    ? getTechniqueById(selectedTechniqueId)
    : null

  // Group techniques by category for the dropdown
  const groupedTechniques = useMemo(() => {
    const groups: Record<TechniqueCategory, ManufacturingTechnique[]> = {} as Record<TechniqueCategory, ManufacturingTechnique[]>
    for (const cat of TECHNIQUE_CATEGORIES) {
      groups[cat] = []
    }
    for (const t of ALL_TECHNIQUES) {
      groups[t.category].push(t)
    }
    return groups
  }, [])

  return (
    <Collapsible defaultOpen={!!selectedTechniqueId}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors group">
        <span className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-international-orange" />
          Manufacturing Technique
          {selectedTechnique && (
            <Badge variant="secondary" className="text-[10px] ml-1">
              {selectedTechnique.name}
            </Badge>
          )}
        </span>
        <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Specify the manufacturing technique you need. This helps suppliers understand your
          requirements and provide accurate quotes.
        </p>

        <div className="space-y-2">
          <Label htmlFor="technique-select">Technique</Label>
          <div className="flex items-center gap-2">
            <Select
              value={selectedTechniqueId || '__none__'}
              onValueChange={v => onSelect(v === '__none__' ? null : v)}
              disabled={disabled}
            >
              <SelectTrigger id="technique-select" className="flex-1">
                <SelectValue placeholder="Select a technique (optional)" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="__none__">None selected</SelectItem>
                {TECHNIQUE_CATEGORIES.map(cat => {
                  const techniques = groupedTechniques[cat]
                  if (techniques.length === 0) return null
                  return (
                    <SelectGroup key={cat}>
                      <SelectLabel>{CATEGORY_LABELS[cat]}</SelectLabel>
                      {techniques.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            {selectedTechnique && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelect(null)}
                disabled={disabled}
                className="shrink-0"
                aria-label="Clear selected technique"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Selected technique info card */}
        {selectedTechnique && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{selectedTechnique.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {selectedTechnique.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedTechnique.materials.slice(0, 4).map(m => (
                <Badge key={m} variant="secondary" className="text-[10px]">
                  {m}
                </Badge>
              ))}
            </div>
            <a
              href={`/learn?tab=techniques`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-electric-blue hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Learn more about this technique
            </a>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
