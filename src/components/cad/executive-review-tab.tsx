"use client"

/**
 * @file executive-review-tab.tsx — Matched fractional executive review panel.
 *
 * @description Shared component for Specify and Source pages. Shows matched
 * fractional executives from the marketplace who can review the design (Specify)
 * or sourcing strategy (Source). Uses matchProjectExperts() server action.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Users, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExpertCard } from "@/components/directory/ExpertCard"
import { matchProjectExperts } from "@/actions/cad-lab-expert-match"
import type { MatchedExpert } from "@/actions/cad-lab-expert-match"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

interface ExecutiveReviewTabProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  context: "design" | "sourcing"
}

export function ExecutiveReviewTab({
  modules,
  diagnosticAnswers,
  context,
}: ExecutiveReviewTabProps) {
  const [experts, setExperts] = useState<MatchedExpert[]>([])
  const [loading, setLoading] = useState(false)
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

  // INTENT: Fingerprint changes when processes, materials, or context change → triggers re-fetch.
  const fingerprint = `${projectNeeds.processes.join(",")}|${projectNeeds.materials.join(",")}|${context}`

  const fetchExperts = useCallback(async () => {
    if (projectNeeds.processes.length === 0 && projectNeeds.materials.length === 0) return
    setLoading(true)
    try {
      const result = await matchProjectExperts({
        processes: projectNeeds.processes,
        materials: projectNeeds.materials,
        context,
      })
      setExperts(result.experts)
    } catch (error) {
      console.error("[ExecutiveReviewTab] Failed to match experts:", error)
    } finally {
      setLoading(false)
    }
  }, [projectNeeds.processes, projectNeeds.materials, context])

  // INTENT: Auto-fetch when the fingerprint changes (new processes/materials/context).
  // Skips if no diagnostic data, or if already fetched with the same fingerprint.
  useEffect(() => {
    if (projectNeeds.processes.length === 0 && projectNeeds.materials.length === 0) return
    if (fetchedFingerprintRef.current === fingerprint) return
    fetchedFingerprintRef.current = fingerprint
    fetchExperts()
  }, [fingerprint, projectNeeds.processes.length, projectNeeds.materials.length, fetchExperts])

  const contextLabel = context === "design" ? "design review" : "sourcing review"

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
            {experts.length > 0 && (
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

      {/* Empty state */}
      {!loading && experts.length === 0 && (
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

      {/* Expert grid */}
      {!loading && experts.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {experts.length} executive{experts.length !== 1 ? "s" : ""} matched for {contextLabel}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {experts.map(({ expert, matchScore, matchReasons }) => (
              <div key={expert.id} className="space-y-2">
                <ExpertCard expert={expert} />
                <div className="px-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="info" className="text-[10px]">
                    {matchScore}pt match
                  </Badge>
                  {matchReasons.slice(0, 2).map((reason) => (
                    <span key={reason} className="text-[10px] text-muted-foreground">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
