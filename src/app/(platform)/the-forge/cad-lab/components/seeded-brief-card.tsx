/**
 * @file seeded-brief-card.tsx — Structured render of a product design brief
 *                              when the active CAD Lab project was created
 *                              via convertBriefToForge.
 *
 * @description Phase 1.4. The brief_content object carried on the
 * cad_lab_projects.seeded_brief_content JSONB column gets rendered here
 * as a structured card — target cost / weight / dimensions, materials
 * guidance, manufacturing constraints, certifications, competitive
 * benchmarks. Previously all of this lived in product_overview as a
 * markdown blob, which the Specify stage had no way to render
 * structurally.
 *
 * Returns null if the project has no seeded_brief_content (i.e. was
 * created some other way). Safe to drop in anywhere the CAD Lab has
 * an active project id.
 *
 * @related
 * - Migration: supabase/migrations/20260419020000_cad_lab_seeded_brief.sql
 * - Action: src/actions/products.ts convertBriefToForge
 * - Types: src/types/product.ts DesignBriefContent
 */

"use client"

import * as React from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Package, Weight, Ruler, FlaskConical, Wrench, ShieldCheck, Target } from "lucide-react"

interface BriefContent {
  product_category?: string
  target_cost_pence?: number
  target_weight_kg?: number
  target_dimensions?: string
  key_requirements?: string[]
  materials_guidance?: string[]
  manufacturing_constraints?: string[]
  competitive_benchmarks?: Array<{ product: string; price: number; key_specs: string }>
  design_priorities?: string[]
  certification_requirements?: string[]
  source_context?: string
}

function formatPounds(pence?: number | null): string | null {
  if (pence == null) return null
  return `£${(pence / 100).toFixed(2)}`
}

export function SeededBriefCard({ projectId }: { projectId: string | null }) {
  const [brief, setBrief] = React.useState<BriefContent | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    if (!projectId) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from("cad_lab_projects")
      .select("seeded_brief_content")
      .eq("id", projectId)
      .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelled) return
        if (error) {
          console.warn("[SeededBriefCard] fetch failed:", error)
          setBrief(null)
        } else if (data?.seeded_brief_content) {
          setBrief(data.seeded_brief_content as BriefContent)
        }
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (isLoading || !brief) return null

  const targetCost = formatPounds(brief.target_cost_pence)
  const hasAny =
    brief.product_category ||
    targetCost ||
    brief.target_weight_kg != null ||
    brief.target_dimensions ||
    (brief.materials_guidance?.length ?? 0) > 0 ||
    (brief.manufacturing_constraints?.length ?? 0) > 0 ||
    (brief.certification_requirements?.length ?? 0) > 0 ||
    (brief.competitive_benchmarks?.length ?? 0) > 0 ||
    (brief.design_priorities?.length ?? 0) > 0

  if (!hasAny) return null

  return (
    <Card className="border-international-orange/20 bg-international-orange/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-international-orange" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Seeded from product brief</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Constraints passed through from the originating product. Everything below is a target — push back on any row that doesn&apos;t match the design you&apos;re actually making.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key numbers */}
        {(brief.product_category || targetCost || brief.target_weight_kg != null || brief.target_dimensions) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {brief.product_category && (
              <div className="flex items-start gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                  <p className="text-sm text-foreground">{brief.product_category}</p>
                </div>
              </div>
            )}
            {targetCost && (
              <div className="flex items-start gap-2">
                <Target className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target cost</p>
                  <p className="text-sm text-foreground tabular-nums">{targetCost}</p>
                </div>
              </div>
            )}
            {brief.target_weight_kg != null && (
              <div className="flex items-start gap-2">
                <Weight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target weight</p>
                  <p className="text-sm text-foreground tabular-nums">{brief.target_weight_kg} kg</p>
                </div>
              </div>
            )}
            {brief.target_dimensions && (
              <div className="flex items-start gap-2">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target dimensions</p>
                  <p className="text-sm text-foreground">{brief.target_dimensions}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* List sections */}
        {(brief.design_priorities?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Design priorities</p>
            <div className="flex flex-wrap gap-1.5">
              {brief.design_priorities!.map((p, i) => (
                <Badge key={i} variant="outline" size="sm">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        {(brief.materials_guidance?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <FlaskConical className="h-3 w-3" aria-hidden="true" /> Materials guidance
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-foreground">
              {brief.materials_guidance!.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {(brief.manufacturing_constraints?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Wrench className="h-3 w-3" aria-hidden="true" /> Manufacturing constraints
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-foreground">
              {brief.manufacturing_constraints!.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {(brief.certification_requirements?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Certification requirements
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-sm text-foreground">
              {brief.certification_requirements!.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {(brief.competitive_benchmarks?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Competitive benchmarks</p>
            <ul className="space-y-1 text-sm text-foreground">
              {brief.competitive_benchmarks!.map((b, i) => (
                <li key={i}>
                  <span className="font-medium">{b.product}</span>{" "}
                  <span className="text-muted-foreground tabular-nums">({formatPounds(b.price)})</span>{" "}
                  <span className="text-muted-foreground">— {b.key_specs}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
