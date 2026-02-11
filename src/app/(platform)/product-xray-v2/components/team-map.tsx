/**
 * @file team-map.tsx — Discipline requirements + people matching
 *
 * @description Derives required disciplines from module expert questions,
 * shows which expertise areas are needed, and displays matched people
 * inline (not in a separate tab).
 */

"use client"

import React, { useMemo, useCallback } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Users, Loader2, RefreshCw, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { MarketCardV2 } from "@/app/(platform)/marketplace-v2/components/MarketCardV2"

import type { XRaySpec } from "../../product-xray/services/xray-schema"
import type { PersonMatch } from "../../product-xray/services/people"
import type { MarketplaceListing } from "@/actions/marketplace"

// ─── Props ───────────────────────────────────────────────────────────

interface TeamMapProps {
  spec: XRaySpec
  people: PersonMatch[]
  isPeopleLoading: boolean
  onRefreshPeople: () => void
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * TeamMap — Discipline requirements and matched experts.
 *
 * @description Derives discipline requirements from expert questions
 * across all modules and shows matched marketplace experts inline.
 */
export function TeamMap({
  spec,
  people,
  isPeopleLoading,
  onRefreshPeople,
}: TeamMapProps): React.ReactNode {
  // Derive discipline requirements
  const disciplines = useMemo(() => {
    const map = new Map<string, { count: number; modules: string[] }>()
    for (const m of spec.modules) {
      for (const eq of m.detail.expertQuestions) {
        const existing = map.get(eq.discipline) || { count: 0, modules: [] }
        existing.count++
        if (!existing.modules.includes(m.name)) existing.modules.push(m.name)
        map.set(eq.discipline, existing)
      }
    }
    return map
  }, [spec.modules])

  // Group people by discipline
  const peopleByDiscipline = useMemo(() => {
    const map = new Map<string, PersonMatch[]>()
    for (const p of people) {
      const existing = map.get(p.matchedDiscipline) || []
      existing.push(p)
      map.set(p.matchedDiscipline, existing)
    }
    return map
  }, [people])

  const toMarketplaceListing = useCallback((p: PersonMatch): MarketplaceListing => {
    if (p.listing) return p.listing as MarketplaceListing
    return {
      id: p.id,
      category: "People",
      subcategory: p.role,
      title: p.name,
      description: p.tags.join(", "),
      attributes: { rate: p.rate, expertise: p.tags, skills: p.tags },
      image_url: null,
      is_verified: p.isVerified,
    }
  }, [])

  const handleViewDetail = useCallback((listing: MarketplaceListing) => {
    toast.info(`Opening ${listing.title} profile`)
  }, [])

  const handleSaveToggle = useCallback((_id: string) => {
    toast.success("Saved to favorites")
  }, [])

  if (spec.modules.length === 0) return null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-chart-3 rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Team &amp; Capabilities
              </h3>
              <p className="text-xs text-muted-foreground">
                Expertise needed based on module expert questions
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onRefreshPeople}
            disabled={isPeopleLoading}
          >
            {isPeopleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
        </div>

        {/* Discipline cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from(disciplines.entries()).map(([discipline, info]) => {
            const matchCount = peopleByDiscipline.get(discipline)?.length ?? 0
            return (
              <div
                key={discipline}
                className="rounded-xl border bg-muted/10 p-3 space-y-1.5"
              >
                <p className="text-xs font-semibold text-foreground">{discipline}</p>
                <p className="text-[10px] text-muted-foreground">
                  {info.count} questions across {info.modules.length} module{info.modules.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-1.5">
                  {matchCount > 0 ? (
                    <Badge variant="success" className="text-[9px]">
                      <CheckCircle2 className="h-2 w-2 mr-0.5" />
                      {matchCount} matched
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px]">No matches</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Loading state */}
        {isPeopleLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        )}

        {/* People matches by discipline */}
        {!isPeopleLoading && people.length > 0 && (
          <div className="space-y-6">
            {Array.from(peopleByDiscipline.entries()).map(([discipline, matches]) => (
              <div key={discipline} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-chart-3" />
                  <span className="text-sm font-semibold text-foreground">{discipline} experts</span>
                  <Badge variant="secondary" className="text-[10px]">{matches.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {matches.slice(0, 3).map((p) => (
                    <MarketCardV2
                      key={`${p.id}-${p.matchedDiscipline}`}
                      listing={toMarketplaceListing(p)}
                      isSaved={false}
                      onSaveToggle={handleSaveToggle}
                      onViewDetail={handleViewDetail}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isPeopleLoading && people.length === 0 && (
          <EmptyState
            title="No matching experts found"
            description="Try scanning a different idea or check that marketplace listings exist."
            action={
              <Button variant="outline" onClick={onRefreshPeople}>
                <Users className="h-4 w-4 mr-2" />
                Retry matching
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  )
}
