"use client"

/**
 * @file specialist-intro-card.tsx — "Meet Your Engineering Team" introduction card.
 *
 * @description Shows a 2x2 grid of specialist mini-profiles on the Specify Overview tab.
 * Only visible when no reviews exist yet. Auto-dismissed after first review is requested.
 *
 * @related
 * - Specialists data: src/app/(platform)/agents/specialists-data.ts
 * - Specify page: src/app/(platform)/the-forge/cad-lab/specify/page.tsx
 */

import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSpecialistById } from "@/lib/agents/specialists-config"

const SPECIALIST_IDS = [
  "vp-manufacturing",
  "vp-engineering",
  "cto",
  "vp-supply-chain",
] as const

interface SpecialistIntroCardProps {
  onNavigateToReview: () => void
}

export function SpecialistIntroCard({ onNavigateToReview }: SpecialistIntroCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Meet Your Engineering Team</CardTitle>
        <p className="text-xs text-muted-foreground">
          Four specialists review your design from different angles — manufacturing, engineering, integration, and supply chain.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SPECIALIST_IDS.map((id) => {
            const spec = getSpecialistById(id)
            if (!spec) return null
            const isRecommended = id === "vp-manufacturing"

            return (
              <div
                key={id}
                className="flex items-start gap-2.5 rounded-md border p-2.5"
              >
                {spec.avatarImage ? (
                  <Image
                    src={spec.avatarImage}
                    alt={spec.name}
                    width={40}
                    height={40}
                    className="rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-muted-foreground">
                      {spec.name[0]}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground">{spec.name}</p>
                    {isRecommended && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{spec.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {spec.tagline}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <Button onClick={onNavigateToReview} className="w-full gap-2">
          Start Review
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
