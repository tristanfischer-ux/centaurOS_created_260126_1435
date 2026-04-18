"use client"

/**
 * @file executive-review-tab.tsx — Matched fractional executive review panel.
 *
 * @description Shared component for Specify and Source pages. Shows matched
 * fractional executives from the marketplace who can review the design (Specify)
 * or sourcing strategy (Source). Uses matchProjectExperts() server action.
 *
 * The panel refuses to advertise weak matches as "matches". Executives whose
 * specialisations don't overlap with the project's processes or materials are
 * labelled "closest candidates" and hidden behind an opt-in disclosure. The
 * default view is honest by construction: either strong matches, or a
 * "no strong matches yet" message — never a wall of 5pt baseline noise.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Link from "next/link"
import { Users, Loader2, RefreshCw, ChevronDown, Factory, ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ExpertCard } from "@/components/directory/ExpertCard"
import { matchProjectExperts } from "@/actions/cad-lab-expert-match"
import type { MatchedExpert } from "@/actions/cad-lab-expert-match"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

interface ExecutiveReviewTabProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  context: "design" | "sourcing"
  useCase?: string
}

export function ExecutiveReviewTab({
  modules,
  diagnosticAnswers,
  context,
  useCase,
}: ExecutiveReviewTabProps) {
  const [strong, setStrong] = useState<MatchedExpert[]>([])
  const [closest, setClosest] = useState<MatchedExpert[]>([])
  const [loading, setLoading] = useState(false)
  const [showClosest, setShowClosest] = useState(false)
  const fetchedFingerprintRef = useRef<string>("")

  // INTENT: Memoize project needs so we get stable references and a stable fingerprint.
  const projectNeeds = useMemo(() => {
    const processes = new Set<string>()
    const materials = new Set<string>()
    for (const mod of modules) {
      const answers = diagnosticAnswers[mod.id]
      if (answers?.mfg_process?.trim()) processes.add(answers.mfg_process.trim())
      if (answers?.material?.trim()) materials.add(answers.material.trim())
    }
    return {
      processes: Array.from(processes).sort(),
      materials: Array.from(materials).sort(),
    }
  }, [modules, diagnosticAnswers])

  // INTENT: Fingerprint changes when processes, materials, context, or useCase change → triggers re-fetch.
  const fingerprint = `${projectNeeds.processes.join(",")}|${projectNeeds.materials.join(",")}|${context}|${useCase ?? ""}`

  const fetchExperts = useCallback(async () => {
    if (projectNeeds.processes.length === 0 && projectNeeds.materials.length === 0) return
    setLoading(true)
    try {
      const result = await matchProjectExperts({
        processes: projectNeeds.processes,
        materials: projectNeeds.materials,
        context,
        useCase,
      })
      setStrong(result.strong)
      setClosest(result.closest)
    } catch (error) {
      console.error("[ExecutiveReviewTab] Failed to match experts:", error)
    } finally {
      setLoading(false)
    }
  }, [projectNeeds.processes, projectNeeds.materials, context, useCase])

  // INTENT: Auto-fetch when the fingerprint changes (new processes/materials/context).
  // Skips if no diagnostic data, or if already fetched with the same fingerprint.
  useEffect(() => {
    if (projectNeeds.processes.length === 0 && projectNeeds.materials.length === 0) return
    if (fetchedFingerprintRef.current === fingerprint) return
    fetchedFingerprintRef.current = fingerprint
    fetchExperts()
  }, [fingerprint, projectNeeds.processes.length, projectNeeds.materials.length, fetchExperts])

  const contextLabel = context === "design" ? "design review" : "sourcing review"
  const hasAnyResults = strong.length > 0 || closest.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-international-orange" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Executive Review</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {context === "design"
                    ? "Fractional executives matched to your design requirements. Get expert eyes on your specifications before sourcing."
                    : "Supply chain executives matched to your sourcing needs. Get expert guidance on supplier selection and procurement strategy."}
                </p>
              </div>
            </div>
            {hasAnyResults && (
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchExperts}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project needs badges */}
      {(projectNeeds.processes.length > 0 || projectNeeds.materials.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {projectNeeds.processes.map((p) => (
            <Badge key={p} variant="secondary" className="text-xs">
              {p}
            </Badge>
          ))}
          {projectNeeds.materials.map((m) => (
            <Badge key={m} variant="secondary" className="text-xs">
              {m}
            </Badge>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-international-orange mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Matching executives to your project&hellip;</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no results at all */}
      {!loading && !hasAnyResults && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No matched executives yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {projectNeeds.processes.length === 0
                ? `Complete diagnostics to match executives for ${contextLabel}.`
                : "No executives matched your project profile. Check back as more experts join the marketplace."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Strong matches — the honest headline + grid */}
      {!loading && strong.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {strong.length} strong match{strong.length !== 1 ? "es" : ""}
            </span>{" "}
            for {contextLabel} — based on specialisation overlap with your project.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strong.map((match) => (
              <ExpertCardWithTier key={match.expert.id} match={match} tier="strong" />
            ))}
          </div>
        </div>
      )}

      {/* No-strong-matches headline (when only closest candidates exist) */}
      {!loading && strong.length === 0 && closest.length > 0 && (
        <Card className="border-muted-foreground/20">
          <CardContent className="py-5">
            <p className="text-sm font-medium text-foreground">
              No strong matches yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              None of the executives we scanned have the right specialisation for this {contextLabel}.
              You can still look at the closest candidates, but don&rsquo;t rely on them as experts in this area.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Supplier-review fallback — offered on Specify (design context) when
          experts are missing or few. Suppliers can review + price the design,
          so this is a useful second path rather than a dead end. */}
      {!loading && context === "design" && strong.length < 2 && (projectNeeds.processes.length > 0 || projectNeeds.materials.length > 0) && (
        <Card className="border-international-orange/30">
          <CardContent className="py-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <Factory className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Or talk to suppliers who could make this
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Suppliers in the Forge marketplace can review the design and quote the work. A 20-minute capability call with two shortlisted suppliers often surfaces the same manufacturability gaps an executive review would — plus pricing and lead-time reality.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <Button asChild size="sm" className="gap-1.5">
                <Link
                  href={{
                    pathname: "/marketplace",
                    query: {
                      category: "Services",
                      q: [...projectNeeds.processes, ...projectNeeds.materials].slice(0, 3).join(" "),
                    },
                  }}
                >
                  Browse matching suppliers
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Filters applied: {[...projectNeeds.processes.slice(0, 2), ...projectNeeds.materials.slice(0, 2)].join(" · ") || "your project tags"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closest candidates — opt-in disclosure */}
      {!loading && closest.length > 0 && (
        <Collapsible open={showClosest} onOpenChange={setShowClosest}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs w-full sm:w-auto"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showClosest ? "rotate-180" : ""}`}
              />
              {showClosest ? "Hide" : "Show"} {closest.length} closest candidate{closest.length !== 1 ? "s" : ""}
              <span className="text-muted-foreground font-normal">(not strong matches)</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground italic">
              These candidates didn&rsquo;t match your specifications. Consider them only as distant options,
              not as experts in your processes or materials.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {closest.map((match) => (
                <ExpertCardWithTier key={match.expert.id} match={match} tier="closest" />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

/**
 * Renders an expert card with a tier pill (Strong match / Closest candidate)
 * plus the existing match score and reasons. Split out so both strong and
 * closest grids share the same card shape, with only the tier styling differing.
 */
function ExpertCardWithTier({
  match,
  tier,
}: {
  match: MatchedExpert
  tier: "strong" | "closest"
}) {
  const { expert, matchScore, matchReasons, sourceLabel } = match

  return (
    <div className="space-y-2">
      <ExpertCard expert={expert} />
      <div className="px-1 flex flex-wrap items-center gap-1.5">
        {tier === "strong" ? (
          <Badge variant="info" className="text-[10px]">
            Strong match · {matchScore}pt
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Closest candidate · {matchScore}pt
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          {sourceLabel}
        </Badge>
        {matchReasons.slice(0, 4).map((reason) => (
          <span key={reason} className="text-[10px] text-muted-foreground">
            {reason}
          </span>
        ))}
      </div>
    </div>
  )
}
