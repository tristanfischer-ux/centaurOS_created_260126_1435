'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Eye } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BlueprintTemplate } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import { toast } from 'sonner'
import { PackCard } from './pack-card'
import { getTemplateIcon, getDifficultyColor, INDUSTRY_CATEGORIES } from './utils'

// ---------------------------------------------------------------------------
// IndustrySelector – grid of industry cards; click one to see its packs.
// Packs for the selected industry are loaded lazily on selection.
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface IndustrySelectorProps {
  templates: BlueprintTemplate[]
  savedPackIds: Set<string>
  onSaveToggle: (packId: string, isSaved: boolean) => void
  /** When set, auto-selects the matching industry on first render */
  defaultIndustry?: string
  /** Team members available for task assignment */
  members?: TeamMember[]
  /** Pack IDs that have already been used to create objectives */
  usedPackIds?: Set<string>
}

export function IndustrySelector({
  templates,
  savedPackIds,
  onSaveToggle,
  defaultIndustry,
  members = [],
  usedPackIds = new Set(),
}: IndustrySelectorProps) {
  const [selected, setSelected] = useState<BlueprintTemplate | null>(null)
  const [packs, setPacks] = useState<ObjectivePack[]>([])
  const [loading, setLoading] = useState(false)
  const [autoSelected, setAutoSelected] = useState(false)

  const industryTemplates = templates.filter(t =>
    INDUSTRY_CATEGORIES.has(t.product_category),
  )

  // Auto-select user's industry on first render
  useEffect(() => {
    if (autoSelected || !defaultIndustry || industryTemplates.length === 0) return
    const slug = defaultIndustry.toLowerCase().replace(/\s+/g, '-')
    const match = industryTemplates.find(t =>
      t.product_category.toLowerCase() === slug ||
      t.name.toLowerCase().includes(defaultIndustry.toLowerCase())
    )
    if (match) {
      setSelected(match)
      setAutoSelected(true)
    }
  }, [defaultIndustry, industryTemplates, autoSelected])

  // Fetch packs when an industry is selected
  useEffect(() => {
    if (!selected) return
    let mounted = true

    async function load() {
      setLoading(true)
      try {
        const { getObjectivePacks } = await import('@/actions/packs')
        const result = await getObjectivePacks({
          productCategory: selected!.product_category,
        })
        if (!mounted) return
        if (result.error) {
          toast.error('Failed to load packs for this industry')
          return
        }
        setPacks(result.packs)
      } catch {
        if (mounted) toast.error('Failed to load packs')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [selected])

  // -----------------------------------------------------------------------
  // Detail view – packs for the selected industry
  // -----------------------------------------------------------------------
  if (selected) {
    const Icon = getTemplateIcon(selected.icon)

    return (
      <div className="space-y-6">
        {/* Back + heading */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelected(null); setPacks([]) }}
            className="-ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            All Industries
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-chart-5/10">
              <Icon className="h-4 w-4 text-chart-5" />
            </div>
            <h3 className="font-semibold">{selected.name}</h3>
          </div>
        </div>

        {selected.description && (
          <p className="text-sm text-muted-foreground -mt-2">
            {selected.description}
          </p>
        )}

        {/* Pack grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse h-64">
                <CardContent className="pt-6 space-y-3">
                  <div className="h-5 w-32 bg-muted rounded" />
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : packs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No objective packs available for this industry yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {packs.map(pack => (
              <PackCard
                key={pack.id}
                pack={pack}
                isSaved={savedPackIds.has(pack.id)}
                onSaveToggle={onSaveToggle}
                members={members}
                alreadyUsed={usedPackIds.has(pack.id)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Grid view – all industry cards
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select an industry to explore its objective packs
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {industryTemplates.map(template => {
          const Icon = getTemplateIcon(template.icon)
          const rawDiff = (template.metadata as Record<string, unknown>)?.difficulty as string | undefined
          const difficulty = rawDiff
            ? rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1)
            : 'Intermediate'

          return (
            <Card
              key={template.id}
              className="cursor-pointer hover:shadow-md hover:border-chart-5/40 hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => setSelected(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-chart-5/10 shrink-0">
                    <Icon className="h-5 w-5 text-chart-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Badge className={cn('text-[10px] mb-1', getDifficultyColor(difficulty))}>
                      {difficulty}
                    </Badge>
                    <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {template.description}
                </p>
                <div className="flex items-center gap-1 text-xs text-chart-5 font-medium">
                  <Eye className="h-3 w-3" />
                  View packs
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
